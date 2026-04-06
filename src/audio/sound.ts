// Web Audio sound system. Engine uses pre-recorded MP3 samples crossfaded
// by speed (technique borrowed from pmndrs/racing-game, MIT licensed).
// Other sounds are generated procedurally from oscillators + noise.

import { attempt, attemptAsync } from "es-toolkit";

const MASTER_VOL = 0.4;
const STORAGE_KEY = "bp:muted";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

let engineBuffers: { idle: AudioBuffer; rev: AudioBuffer } | null = null;
let engineLoadPromise: Promise<void> | null = null;
let engineNodes: {
  idleSrc: AudioBufferSourceNode;
  revSrc: AudioBufferSourceNode;
  idleGain: GainNode;
  revGain: GainNode;
  bus: GainNode;
} | null = null;
let sirenNodes: {
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  toggleInterval: number;
} | null = null;

type IWindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

export function initAudio() {
  if (ctx) return;
  const [err, created] = attempt(() => {
    const Ctor = window.AudioContext || (window as IWindowWithWebkitAudio).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio not supported");
    const audioCtx = new Ctor();
    const gain = audioCtx.createGain();
    gain.gain.value = MASTER_VOL;
    gain.connect(audioCtx.destination);
    return { audioCtx, gain };
  });
  if (err || !created) return; // Audio not supported — silently ignore
  ctx = created.audioCtx;
  masterGain = created.gain;

  const [, stored] = attempt(() => localStorage.getItem(STORAGE_KEY));
  muted = stored === "1";
  if (muted) masterGain.gain.value = 0;

  // Kick off engine sample preload (fire-and-forget)
  loadEngineBuffers();
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (masterGain) masterGain.gain.value = muted ? 0 : MASTER_VOL;
  attempt(() => localStorage.setItem(STORAGE_KEY, muted ? "1" : "0"));
  return muted;
}

// --- Helpers ---
function now(): number {
  return ctx ? ctx.currentTime : 0;
}

/**
 * Stop (if a source) and disconnect a list of audio nodes. Web Audio
 * throws if a source is double-stopped or a node is already disconnected;
 * those errors are intentionally swallowed.
 */
function safeDispose(...nodes: (AudioNode | null | undefined)[]) {
  for (const node of nodes) {
    if (!node) continue;
    if ("stop" in node && typeof (node as AudioScheduledSourceNode).stop === "function") {
      attempt(() => (node as AudioScheduledSourceNode).stop());
    }
    attempt(() => node.disconnect());
  }
}

function envelope(gain: GainNode, attack: number, peak: number, decay: number) {
  if (!ctx) return;
  const t = now();
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseBuffer(duration: number): AudioBuffer | null {
  if (!ctx) return null;
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// --- Engine ---

async function fetchBuffer(url: string): Promise<AudioBuffer | null> {
  if (!ctx) return null;
  const [err, buf] = await attemptAsync(async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return ctx!.decodeAudioData(await res.arrayBuffer());
  });
  if (err) {
    console.warn(`[audio] failed to load ${url}`, err);
    return null;
  }
  return buf;
}

// Returns a promise that resolves AFTER the buffers are loaded (or null if
// already loaded). Multiple callers share the same in-flight promise so they
// all wait for the same fetch.
function loadEngineBuffers(): Promise<void> {
  if (engineBuffers) return Promise.resolve();
  if (engineLoadPromise) return engineLoadPromise;
  engineLoadPromise = (async () => {
    const [idle, rev] = await Promise.all([
      fetchBuffer("/sounds/engine.mp3"),
      fetchBuffer("/sounds/accelerate.mp3"),
    ]);
    if (idle && rev) {
      engineBuffers = { idle, rev };
      console.log("[audio] engine MP3s loaded successfully");
    } else {
      console.warn("[audio] engine buffers failed to load — no engine sound");
    }
  })();
  return engineLoadPromise;
}

function buildEngineNodes() {
  if (!ctx || !masterGain || !engineBuffers || engineNodes) return;
  const idleSrc = ctx.createBufferSource();
  const revSrc = ctx.createBufferSource();
  const idleGain = ctx.createGain();
  const revGain = ctx.createGain();
  const bus = ctx.createGain();
  idleSrc.buffer = engineBuffers.idle;
  revSrc.buffer = engineBuffers.rev;
  idleSrc.loop = true;
  revSrc.loop = true;

  // idleGain/revGain handle crossfade ONLY (0..1 range, no amplification —
  // keeps the signal clean). Engine bus does the pre-gain to compensate for
  // masterGain (0.4). 2.0 × 0.4 = 0.8 effective amplitude — close to raw
  // file, with headroom for SFX on top.
  idleGain.gain.value = 1.0; // start at idle (will be updated by setEngineSpeed)
  revGain.gain.value = 0;
  bus.gain.value = 1.3;

  // Starting playback rates match the setEngineSpeed baselines so the
  // first frame doesn't pop. NOTE: rev sample (accelerate.mp3) is a
  // high-RPM recording and is intentionally played SLOWER than native
  // (per pmndrs/racing-game) — playing it faster sounds chipmunky.
  idleSrc.playbackRate.value = 1.0;
  revSrc.playbackRate.value = 0.55;

  idleSrc.connect(idleGain);
  revSrc.connect(revGain);
  idleGain.connect(bus);
  revGain.connect(bus);
  bus.connect(masterGain);

  idleSrc.start();
  revSrc.start();
  engineNodes = { idleSrc, revSrc, idleGain, revGain, bus };
}

// "Engine wants to be on" intent. Set true by startEngine, false by stopEngine.
// Used so the async-load path knows whether to actually build the nodes once
// the buffers arrive (the user may have already died before the load finishes).
let engineWanted = false;

export function startEngine() {
  if (!ctx || !masterGain) return;
  engineWanted = true;
  if (engineNodes) return;
  if (engineBuffers) {
    buildEngineNodes();
  } else {
    loadEngineBuffers().then(() => {
      if (engineWanted && !engineNodes) buildEngineNodes();
    });
  }
}

export function setEngineSpeed(speedRatio: number) {
  if (!ctx || !engineNodes) return;
  const t = now();

  // Volumes — modeled on pmndrs/racing-game:
  //   idle = 1 - speed/max          (max 1.0 at standstill, 0 at top speed)
  //   rev  = 0.6 * speed/max        (max 0.6 at top speed — kept LOWER than
  //                                  idle's max because our accelerate.mp3
  //                                  is naturally louder than engine.mp3,
  //                                  unlike racing-game where the opposite
  //                                  is true and they multiply by 2)
  const idleVol = 1 - speedRatio;
  const revVol = speedRatio * 0.6;
  engineNodes.idleGain.gain.setTargetAtTime(idleVol, t, 0.08);
  engineNodes.revGain.gain.setTargetAtTime(revVol, t, 0.08);

  // Playback rates — modeled on pmndrs/racing-game (engine = rpm+1, rev = rpm+0.5):
  //   idle: 1.0x → 1.30x  (idle.mp3 is a low-RPM recording, sped up slightly)
  //   rev:  0.55x → 0.85x (accelerate.mp3 is a HIGH-RPM recording,
  //                        intentionally SLOWED so it doesn't sound chipmunky)
  // The rev sample being slowed below 1.0 is the key racing-game insight
  // I missed earlier — without this it sounded like an angry mosquito.
  const idleRate = 1.0 + speedRatio * 0.3;
  const revRate = 0.55 + speedRatio * 0.3;
  engineNodes.idleSrc.playbackRate.setTargetAtTime(idleRate, t, 0.08);
  engineNodes.revSrc.playbackRate.setTargetAtTime(revRate, t, 0.08);
}

export function stopEngine() {
  engineWanted = false;
  if (!engineNodes) return;
  const n = engineNodes;
  safeDispose(n.idleSrc, n.revSrc, n.idleGain, n.revGain, n.bus);
  engineNodes = null;
}

// --- Siren (hi-lo two-tone, classic European emergency vehicle) ---
// Discrete tone jumps every 0.55s — there is no continuous modulation
// in the 4-20 Hz "insect wing" range, so this can never read as a bug.
const SIREN_HI = 750;
const SIREN_LO = 480;
const SIREN_TOGGLE_MS = 550;

export function startSiren() {
  if (!ctx || !masterGain || sirenNodes) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = "square";
  osc.frequency.value = SIREN_LO;
  filter.type = "lowpass";
  filter.frequency.value = 1500;
  filter.Q.value = 0.7;
  gain.gain.value = 0;
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc.start();

  let high = false;
  const toggleInterval = window.setInterval(() => {
    if (!ctx || !sirenNodes) return;
    high = !high;
    sirenNodes.osc.frequency.setValueAtTime(high ? SIREN_HI : SIREN_LO, now());
  }, SIREN_TOGGLE_MS);

  sirenNodes = { osc, gain, filter, toggleInterval };
}

export function setSirenVolume(intensity: number) {
  if (!ctx || !sirenNodes) return;
  sirenNodes.gain.gain.setTargetAtTime(0.012 + intensity * 0.03, now(), 0.2);
}

export function stopSiren() {
  if (!sirenNodes) return;
  clearInterval(sirenNodes.toggleInterval);
  safeDispose(sirenNodes.osc, sirenNodes.filter, sirenNodes.gain);
  sirenNodes = null;
}

// --- One-shot SFX ---
// SFX peaks are intentionally loud (close to clip) so they cut through BGM.
export function playCrash() {
  if (!ctx || !masterGain) return;
  const buf = noiseBuffer(0.35);
  if (!buf) return;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = buf;
  filter.type = "lowpass";
  filter.frequency.value = 1200;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  envelope(gain, 0.003, 1.4, 0.3);
  src.start();

  // Add a punchy sub-thump for body
  const t = now();
  const thump = ctx.createOscillator();
  const tg = ctx.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(140, t);
  thump.frequency.exponentialRampToValueAtTime(50, t + 0.15);
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  thump.connect(tg);
  tg.connect(masterGain);
  thump.start(t);
  thump.stop(t + 0.22);
}

export function playSplash() {
  if (!ctx || !masterGain) return;
  const buf = noiseBuffer(0.7);
  if (!buf) return;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = buf;
  filter.type = "highpass";
  filter.frequency.value = 1200;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  envelope(gain, 0.005, 1.0, 0.6);
  src.start();
}

type IArpeggioOpts = {
  notes: number[];
  type: OscillatorType;
  spacing: number; // seconds between note onsets
  attack: number;
  peak: number;
  decay: number;
};

/** Schedule a sequence of staggered tone bursts on the master bus. */
function playArpeggio(opts: IArpeggioOpts) {
  if (!ctx || !masterGain) return;
  const t0 = now();
  for (let i = 0; i < opts.notes.length; i++) {
    const start = t0 + i * opts.spacing;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type;
    o.frequency.value = opts.notes[i];
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(opts.peak, start + opts.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + opts.attack + opts.decay);
    o.connect(g);
    g.connect(masterGain);
    o.start(start);
    o.stop(start + opts.attack + opts.decay + 0.02);
  }
}

export function playPickup() {
  // Two-note "ding!"
  playArpeggio({ notes: [880, 1320], type: "triangle", spacing: 0.06, attack: 0.01, peak: 0.6, decay: 0.18 });
}

export function playLevelUp() {
  // C E G C — major arpeggio
  playArpeggio({ notes: [523, 659, 784, 1047], type: "square", spacing: 0.08, attack: 0.02, peak: 0.5, decay: 0.2 });
}

export function playGameOver() {
  // C Bb G Eb — descending sting
  playArpeggio({ notes: [523, 466, 392, 311], type: "sawtooth", spacing: 0.15, attack: 0.03, peak: 0.55, decay: 0.4 });
}

// Resume audio context after user gesture (mobile autoplay policy)
export function resumeAudio() {
  if (ctx?.state === "suspended") {
    attemptAsync(() => ctx!.resume());
  }
}
