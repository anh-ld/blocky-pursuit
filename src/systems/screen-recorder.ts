/**
 * Auto-records gameplay sessions and uploads only when the score
 * qualifies for the top leaderboard.
 *
 * Records at 800 Kbps WebM — bitrate caps file size regardless of
 * canvas resolution (~6 MB/min at this setting).
 */

// 800 Kbps — bitrate controls file size, not resolution
const VIDEO_BITRATE = 800_000;

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingSessionId: string | null = null;
let isRecording = false;

/**
 * Start recording the current gameplay session.
 * Captures the game canvas output at 480p / 800 Kbps.
 */
export async function startRecording(canvas: HTMLCanvasElement): Promise<void> {
  if (isRecording) return;

  // Check browser support
  if (!canvas.captureStream) {
    console.warn("[recorder] canvas.captureStream not supported");
    return;
  }

  try {
    const stream = canvas.captureStream(30); // 30 FPS
    const mimeType = getSupportedMimeType();

    if (!mimeType) {
      console.warn("[recorder] No supported MIME type for recording");
      return;
    }

    recordedChunks = [];
    recordingSessionId = generateSessionId();

    mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.start(1000); // Collect data every 1 second
    isRecording = true;
    console.log(`[recorder] Started session ${recordingSessionId}`);
  } catch (err) {
    console.warn("[recorder] Failed to start recording:", err);
  }
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
      recorder.stream.getTracks().forEach((t) => t.stop());
      resolve(blob);
      cleanup();
    };

    recorder.stop();
  });
}

/**
 * Discard the current recording without uploading.
 */
export function discardRecording(): void {
  const sid = recordingSessionId; // Capture before cleanup nulls it
  if (mediaRecorder && isRecording) {
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  }
  cleanup();
  if (sid) console.log(`[recorder] Discarded session ${sid}`);
}

/**
 * Check if we're currently recording.
 */
export function getRecordingStatus(): boolean {
  return isRecording;
}

/**
 * Get the current session ID for reference.
 */
export function getSessionId(): string | null {
  return recordingSessionId;
}

// --- Internal helpers ---

function getSupportedMimeType(): string | null {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return null;
}

function cleanup(): void {
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
