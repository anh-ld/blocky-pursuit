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
 * Bitrate: 150 Kbps. FPS: 10. ~2 MB for a 3-min run.
 */

import { attempt } from "es-toolkit";

const VIDEO_BITRATE = 150_000; // 150 kbps — superlightweight
const CAPTURE_FPS = 10; // 10 FPS — replays are for "look at this moment", not analysis
const CHUNK_INTERVAL_MS = 4000; // ~75 KB per chunk; 4 s keeps ondataavailable churn low
// Hard cap so memory + final upload don't grow unbounded on marathon runs.
const MAX_DURATION_MS = 4 * 60 * 1000;

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingSessionId: string | null = null;
let isRecording = false;
let durationCapTimer: number | null = null;

/**
 * Start recording the current gameplay session.
 * Silently no-ops if the browser can't capture the canvas or doesn't
 * expose a hardware H.264 encoder.
 */
export async function startRecording(canvas: HTMLCanvasElement): Promise<void> {
  if (isRecording) return;
  if (!canvas.captureStream) return;

  const mimeType = getSupportedMimeType();
  if (!mimeType) return;

  const [err, recorder] = attempt(() => {
    const stream = canvas.captureStream(CAPTURE_FPS);
    return new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
    });
  });
  if (err || !recorder) return;

  recordedChunks = [];
  recordingSessionId = generateSessionId();
  mediaRecorder = recorder;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };

  recorder.start(CHUNK_INTERVAL_MS);
  isRecording = true;

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
 * Returns null if recording wasn't active or failed.
 */
export function stopRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!mediaRecorder || !isRecording) {
      resolve(null);
      return;
    }
    const recorder = mediaRecorder;

    recorder.onstop = () => {
      isRecording = false;
      const blob = new Blob(recordedChunks, {
        type: recorder.mimeType || "video/webm",
      });
      attempt(() => recorder.stream.getTracks().forEach((t) => t.stop()));
      resolve(blob);
      cleanup();
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
  mediaRecorder = null;
  recordedChunks = [];
  recordingSessionId = null;
  isRecording = false;
}

function generateSessionId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}
