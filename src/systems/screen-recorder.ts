/** Auto-records; uploads on top-50. H.264 ONLY — no SW fallback. VP8/VP9 fights WebGL & stutters; HW = zero perf impact. */
/** Coverage: ✓ Chrome 122+ Mac/Win/Android, Safari 14.1+, Edge. */

import { attempt } from "es-toolkit";

/* 1 Mbps target. CEILING not floor — H.264 emits less when content doesn't need it. Action spikes → generous ceiling. */
const VIDEO_BITRATE = 1_000_000;
/* 24 fps = cinema standard, threshold where motion stops reading as slideshow. Same bitrate budget regardless of FPS. */
const CAPTURE_FPS = 24;
const CHUNK_INTERVAL_MS = 4000;
/* 540p (960×540). Game canvas is HiDPI (2560×1440 on DPR=2 Mac). Feeding it to MediaRecorder forces ~1 Mbps. */
const CAPTURE_WIDTH = 960;
const CAPTURE_HEIGHT = 540;
/* 2 min cap. Worst case 540p/1Mbps = 1Mbps×120s=15MB; realistic ~5-8MB (encoder below hint). */
const MAX_DURATION_MS = 2 * 60 * 1000;
/* Hard upload ceiling. Bigger → silently dropped. Edge fn (not sync) — 6MB Lambda cap N/A. 11MB = server's 12MB - 1MB. */
export const MAX_UPLOAD_SIZE = 11 * 1024 * 1024;

/* Capture pipeline: encoder reads from small 540p canvas (not live game). setInterval blits via drawImage. */
type ICanvasCaptureTrack = MediaStreamTrack & { requestFrame?: () => void };

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingSessionId: string | null = null;
let isRecording = false;
let durationCapTimer: number | null = null;
/* Capture pipeline state. The canvas itself isn't held — its 2D context keeps it alive until cleanup nulls captureCtx. */
let captureCtx: CanvasRenderingContext2D | null = null;
let captureTrack: ICanvasCaptureTrack | null = null;
let captureFrameTimer: number | null = null;

/** Start recording. Silently no-ops if browser can't capture or lacks hardware H.264. */
export async function startRecording(gameCanvas: HTMLCanvasElement): Promise<void> {
  if (isRecording) return;

  const mimeType = getSupportedMimeType();
  if (!mimeType) return;
  await waitForPaintFrames(2);

  /* Pipeline: gameCanvas (HiDPI WebGL) → drawImage → 540p canvas → captureStream(0)+requestFrame() → MediaRecorder → H.264. */
  const [setupErr, setup] = attempt(() => {
    const c = document.createElement("canvas");
    c.width = CAPTURE_WIDTH;
    c.height = CAPTURE_HEIGHT;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    /* Seed an initial frame so the captured stream has content the moment MediaRecorder.start() runs. */
    ctx.drawImage(gameCanvas, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);

    if (!c.captureStream) return null;
    const stream = c.captureStream(0); /* manual frame mode */
    const track = stream.getVideoTracks()[0] as ICanvasCaptureTrack | undefined;
    if (!track) return null;
    /* Manual frame mode requires `requestFrame()` to emit frames. Without it, stream is empty → zero-byte file. */
    if (typeof track.requestFrame !== "function") return null;

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
    });

    return { ctx, track, recorder };
  });

  if (setupErr || !setup) return;

  /* Per-session chunks. ondataavailable closes over LOCAL array → future startRecording can't hijack old recorder. */
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

  /* Drive capture: every 1000/CAPTURE_FPS ms, downscale & commit a frame. attempt() guards against GL context loss mid-run. */
  const frameMs = Math.round(1000 / CAPTURE_FPS);

  captureFrameTimer = window.setInterval(() => {
    if (!captureCtx || !captureTrack) return;

    attempt(() => {
      captureCtx!.drawImage(gameCanvas, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
      captureTrack!.requestFrame?.();
    });
  }, frameMs);

  /* Auto-pause after MAX_DURATION_MS so buffer can't grow unbounded. Pause (not stop) → next gameOver still has capture. */
  durationCapTimer = window.setTimeout(() => {
    if (isRecording && mediaRecorder && mediaRecorder.state === "recording") {
      attempt(() => mediaRecorder!.requestData());
      attempt(() => mediaRecorder!.pause());
    }
  }, MAX_DURATION_MS);
}

/** Stop recording, return blob. Null if inactive, empty, or recorder failed. */
export function stopRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!mediaRecorder || !isRecording) {
      resolve(null);
      return;
    }

    const recorder = mediaRecorder;

    /* Stop capture interval immediately — don't waste cycles blitting/requestFrame during ~100-500ms teardown window. */
    if (captureFrameTimer !== null) {
      clearInterval(captureFrameTimer);
      captureFrameTimer = null;
    }

    /* Capture chunks ref NOW — racing discardRecording (nulls module array) can't strand us when onstop fires. */
    const chunks = recordedChunks;
    const mimeType = recorder.mimeType || "video/mp4";

    recorder.onstop = () => {
      isRecording = false;
      attempt(() => recorder.stream.getTracks().forEach((t) => t.stop()));

      /* Reject empty blobs so handleRecordingUpload short-circuits instead of POSTing a zero-byte file. */
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

/** Discard current recording without uploading. */
export function discardRecording(): void {
  if (mediaRecorder && isRecording) {
    attempt(() => mediaRecorder!.stream.getTracks().forEach((t) => t.stop()));
  }

  cleanup();
}

/** Current session ID. */
export function getSessionId(): string | null {
  return recordingSessionId;
}

/* Internal helpers */

function getSupportedMimeType(): string | null {
  /* HW H.264 only — no SW fallback. Browsers with MediaRecorder MP4 = platform has HW encoder. No match → null. */
  const types = ["video/mp4;codecs=avc1.42E01F" /* H.264 baseline profile, level 3.1 */, "video/mp4"];

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
  /* recordedChunks intentionally NOT reset — racing discardRecording during pending stopRecording must not strand the ref. */
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
