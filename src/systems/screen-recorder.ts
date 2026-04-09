/**
 * Auto-records gameplay sessions and uploads only when the score
 * qualifies for the top-50 leaderboard.
 *
 * Encoding: VP8 @ 150 Kbps / 15 FPS — ~3.3 MB for a 3-min run.
 * VP8 is preferred over VP9 because software VP9 encoding is much
 * heavier on the main thread. At this bitrate/FPS even budget mobile
 * devices encode without dropping frames, so we let the natural
 * capability gates (captureStream, isTypeSupported, MediaRecorder
 * construction) decide whether recording can happen.
 */

import { attempt } from "es-toolkit";

const VIDEO_BITRATE = 150_000; // 150 kbps — superlightweight
const CAPTURE_FPS = 15; // 15 FPS — still legible for arcade replays
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
 * Captures the game canvas at 15 FPS / 150 Kbps VP8.
 */
export async function startRecording(canvas: HTMLCanvasElement): Promise<void> {
  if (isRecording) return;

  if (!canvas.captureStream) {
    console.warn("[recorder] canvas.captureStream not supported");
    return;
  }

  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    console.warn("[recorder] No supported MIME type for recording");
    return;
  }

  const [err, recorder] = attempt(() => {
    const stream = canvas.captureStream(CAPTURE_FPS);
    return new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
    });
  });

  if (err || !recorder) {
    console.warn("[recorder] Failed to start recording:", err);
    return;
  }

  recordedChunks = [];
  recordingSessionId = generateSessionId();
  mediaRecorder = recorder;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  recorder.start(CHUNK_INTERVAL_MS);
  isRecording = true;

  // Auto-pause after MAX_DURATION_MS so the buffer can't grow unbounded.
  // Pause (not stop) so the next gameOver still gets whatever we captured.
  durationCapTimer = window.setTimeout(() => {
    if (isRecording && mediaRecorder && mediaRecorder.state === "recording") {
      attempt(() => mediaRecorder!.requestData());
      attempt(() => mediaRecorder!.pause());
      console.log("[recorder] Hit max duration, paused");
    }
  }, MAX_DURATION_MS);

  console.log(`[recorder] Started session ${recordingSessionId}`);
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
      console.log(
        `[recorder] Stopped session ${recordingSessionId}, size: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`,
      );
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
  const sid = recordingSessionId; // Capture before cleanup nulls it
  if (mediaRecorder && isRecording) {
    attempt(() => mediaRecorder!.stream.getTracks().forEach((t) => t.stop()));
  }
  cleanup();
  if (sid) console.log(`[recorder] Discarded session ${sid}`);
}

/**
 * Get the current session ID for reference.
 */
export function getSessionId(): string | null {
  return recordingSessionId;
}

// --- Internal helpers ---

function getSupportedMimeType(): string | null {
  // VP8 first: software VP9 encoding is significantly heavier on the
  // main thread. No audio track is captured so codec strings omit ",opus".
  const types = ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
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
