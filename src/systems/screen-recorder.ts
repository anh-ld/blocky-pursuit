/**
 * Auto-records gameplay sessions and uploads only when the score
 * qualifies for the top-50 leaderboard.
 *
 * Encoding: H.264 (MP4) ONLY. No software-encoder fallback.
 *
 * Rationale: software VP8/VP9 encoding competes with the WebGL
 * renderer for CPU/GPU bandwidth and visibly stutters the game,
 * especially on Apple Silicon. Hardware H.264 via MediaRecorder is
 * the only path with truly zero perf impact. If the browser doesn't
 * expose it, recording is silently disabled — gameplay always wins
 * over the optional replay feature.
 *
 * Coverage with hardware H.264 in MediaRecorder:
 *   ✓ Chrome 122+ on Mac (VideoToolbox)
 *   ✓ Chrome 122+ on Windows (Media Foundation)
 *   ✓ Chrome on Android (depends on chipset, usually yes)
 *   ✓ Safari 14.1+ on macOS / iOS
 *   ✓ Edge (Chromium)
 *   ✗ Firefox (no MP4 in MediaRecorder as of 2025)
 *   ✗ Old Chrome (<122)
 *
 * Bitrate hint: 180 Kbps. FPS: 10. Source downscaled to 768×432
 * before encoding so replay quality stays decent while the average
 * 3-minute clip remains comfortably under the 5 MB upload ceiling.
 */

import { attempt } from "es-toolkit";

// 180 kbps target. The encoder will actually honor this hint at 432p
// source resolution (it ignored 100–250 kbps hints when fed a 1440p
// source because they're below its minimum for high-res content).
const VIDEO_BITRATE = 180_000;
const CAPTURE_FPS = 10;
const CHUNK_INTERVAL_MS = 4000;
// Downscale the captured frame to 432p widescreen. The game canvas is
// rendered at full HiDPI (e.g. 2560×1440 on a DPR=2 Mac), and feeding
// that straight to MediaRecorder forces the H.264 encoder to spend
// ~1 Mbps regardless of the bitrate hint. At 768×432 there are ~22×
// fewer pixels per frame than the source, the encoder's natural rate
// stays near the upload budget while preserving more scene detail.
const CAPTURE_WIDTH = 768;
const CAPTURE_HEIGHT = 432;
// 3 minutes. Combined with the size ceiling below, this keeps the worst
// case comfortably under Netlify's 6 MB request body limit even when the
// HW encoder decides to ignore the bitrate hint.
const MAX_DURATION_MS = 3 * 60 * 1000;
// Hard client-side ceiling for uploads. Anything bigger is silently
// dropped — the player's score still counts, they just don't get a
// replay. Netlify sync functions cap at 6 MB body; we leave 1 MB
// headroom for HTTP overhead and pick 5 MB as the safe ceiling.
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

// Canvas-capture pipeline. The encoder reads from a small, fixed
// 432p canvas, not the live game canvas. A setInterval at CAPTURE_FPS
// blits the game canvas into it via drawImage (GPU-side downscale,
// ~1 ms per call) and asks the track for a frame.
type ICanvasCaptureTrack = MediaStreamTrack & { requestFrame?: () => void };

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingSessionId: string | null = null;
let isRecording = false;
let durationCapTimer: number | null = null;
// Capture pipeline state. The canvas itself isn't held — its 2D
// context keeps it alive until cleanup nulls captureCtx.
let captureCtx: CanvasRenderingContext2D | null = null;
let captureTrack: ICanvasCaptureTrack | null = null;
let captureFrameTimer: number | null = null;

/**
 * Start recording the current gameplay session.
 * Silently no-ops if the browser can't capture the canvas or doesn't
 * expose a hardware H.264 encoder.
 */
export async function startRecording(gameCanvas: HTMLCanvasElement): Promise<void> {
  if (isRecording) return;

  const mimeType = getSupportedMimeType();
  if (!mimeType) return;
  await waitForPaintFrames(2);

  // Build the downscale pipeline:
  //   gameCanvas (HiDPI WebGL, e.g. 2560×1440)
  //     ↓ drawImage (GPU downscale, ~1 ms)
  //   captureCanvas (768×432 2D)
  //     ↓ captureStream(0) + manual requestFrame()
  //   MediaStream → MediaRecorder → H.264 encoder
  //
  // Driving the blit from a setInterval at CAPTURE_FPS keeps the cost
  // off the per-frame render path: 10 Hz × ~1 ms = ~1.5% main-thread
  // budget at 60 FPS, well below anything that could cause stutter.
  const [setupErr, setup] = attempt(() => {
    const c = document.createElement("canvas");
    c.width = CAPTURE_WIDTH;
    c.height = CAPTURE_HEIGHT;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Seed an initial frame so the captured stream has content the
    // moment MediaRecorder.start() runs.
    ctx.drawImage(gameCanvas, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);

    if (!c.captureStream) return null;
    const stream = c.captureStream(0); // manual frame mode
    const track = stream.getVideoTracks()[0] as ICanvasCaptureTrack | undefined;
    if (!track) return null;
    // Manual frame mode requires `requestFrame()` to actually emit any
    // frames. Without it the stream stays empty and MediaRecorder
    // produces a zero-byte file. Bail rather than record garbage.
    if (typeof track.requestFrame !== "function") return null;

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
    });

    return { ctx, track, recorder };
  });

  if (setupErr || !setup) return;

  // Each recording session owns its own chunks array. The recorder's
  // ondataavailable closes over this LOCAL array — not the module
  // variable — so a future startRecording cannot hijack the old
  // recorder's pushes by reassigning the module reference. The module
  // variable is updated in lockstep so stopRecording can find the
  // active array without an extra registry.
  const chunks: Blob[] = [];
  recordedChunks = chunks;

  captureCtx = setup.ctx;
  captureTrack = setup.track;
  mediaRecorder = setup.recorder;
  recordingSessionId = generateSessionId();

  setup.recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  setup.recorder.start(CHUNK_INTERVAL_MS);
  isRecording = true;

  // Drive the capture: every 1000/CAPTURE_FPS ms, downscale the game
  // canvas into the small capture canvas and commit a frame to the
  // track. attempt() guards against the rare case where the GL context
  // is lost mid-run — the interval keeps ticking but no-ops.
  const frameMs = Math.round(1000 / CAPTURE_FPS);
  captureFrameTimer = window.setInterval(() => {
    if (!captureCtx || !captureTrack) return;
    attempt(() => {
      captureCtx!.drawImage(gameCanvas, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
      captureTrack!.requestFrame?.();
    });
  }, frameMs);

  // Auto-pause after MAX_DURATION_MS so the buffer can't grow unbounded.
  // Pause (not stop) so the next gameOver still gets whatever we captured.
  durationCapTimer = window.setTimeout(() => {
    if (isRecording && mediaRecorder && mediaRecorder.state === "recording") {
      attempt(() => mediaRecorder!.requestData());
      attempt(() => mediaRecorder!.pause());
    }
  }, MAX_DURATION_MS);
}

/**
 * Stop recording and return the recorded blob.
 * Returns null if recording wasn't active, the final blob is empty,
 * or the recorder failed.
 */
export function stopRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!mediaRecorder || !isRecording) {
      resolve(null);
      return;
    }
    const recorder = mediaRecorder;

    // Stop the capture interval immediately so we don't waste cycles
    // blitting and calling requestFrame on a track that's tearing down
    // during the (~100-500 ms) window between recorder.stop() and the
    // onstop event firing.
    if (captureFrameTimer !== null) {
      clearInterval(captureFrameTimer);
      captureFrameTimer = null;
    }

    // Capture the chunks reference NOW so a racing discardRecording
    // (which nulls the module-level array) can't strand us with an
    // empty array when onstop finally fires. ondataavailable still
    // pushes to the module-level recordedChunks, so the final chunk
    // arriving after recorder.stop() lands here as long as nothing
    // reassigned the variable in between.
    const chunks = recordedChunks;
    const mimeType = recorder.mimeType || "video/mp4";

    recorder.onstop = () => {
      isRecording = false;
      attempt(() => recorder.stream.getTracks().forEach((t) => t.stop()));
      // Reject empty blobs so handleRecordingUpload short-circuits
      // instead of POSTing a zero-byte file.
      if (chunks.length === 0) {
        cleanup();
        resolve(null);
        return;
      }
      const blob = new Blob(chunks, { type: mimeType });
      cleanup();
      if (blob.size === 0) {
        resolve(null);
        return;
      }
      resolve(blob);
    };

    attempt(() => recorder.stop());
  });
}

/**
 * Discard the current recording without uploading.
 */
export function discardRecording(): void {
  if (mediaRecorder && isRecording) {
    attempt(() => mediaRecorder!.stream.getTracks().forEach((t) => t.stop()));
  }
  cleanup();
}

/**
 * Get the current session ID for reference.
 */
export function getSessionId(): string | null {
  return recordingSessionId;
}

// --- Internal helpers ---

function getSupportedMimeType(): string | null {
  // Hardware H.264 only. No software-encoder fallback — see header doc.
  // Browsers that expose MediaRecorder MP4 support do so because the
  // platform has a hardware video encoder behind it. If neither type
  // matches, we return null and recording is silently skipped.
  const types = [
    "video/mp4;codecs=avc1.42E01F", // H.264 baseline profile, level 3.1
    "video/mp4",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

function cleanup(): void {
  if (durationCapTimer !== null) {
    clearTimeout(durationCapTimer);
    durationCapTimer = null;
  }
  if (captureFrameTimer !== null) {
    clearInterval(captureFrameTimer);
    captureFrameTimer = null;
  }
  mediaRecorder = null;
  // recordedChunks is intentionally NOT reset here. A racing
  // discardRecording during a pending stopRecording must not strand
  // the captured chunks reference held in stopRecording's closure.
  // startRecording assigns a fresh array on the next run, so leftover
  // data is released as soon as a new recording begins.
  recordingSessionId = null;
  isRecording = false;
  captureCtx = null;
  captureTrack = null;
}

function generateSessionId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

function waitForPaintFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = Math.max(1, count);
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}
