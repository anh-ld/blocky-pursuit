// Procedural audio system using Web Audio API. Zero asset weight.
// All sounds are generated from oscillators + noise on the fly.

type AudioCtx = AudioContext;

let ctx: AudioCtx | null = null;
let masterGain: GainNode | null = null;
let muted = false;
// Engine = two looped MP3s crossfaded by speed (technique borrowed from
// https://github.com/pmndrs/racing-game — MIT licensed). The MP3 files are
// also from that repo (public/sounds/engine.mp3 + accelerate.mp3).
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

const STORAGE_KEY = "bp:muted";

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.4;
    masterGain.connect(ctx.destination);
    muted = localStorage.getItem(STORAGE_KEY) === "1";
    if (muted && masterGain) masterGain.gain.value = 0;
    // Kick off engine sample preload (fire-and-forget)
    loadEngineBuffers();
  } catch {
    // Audio not supported — silently ignore
  }
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (masterGain) masterGain.gain.value = muted ? 0 : 0.4;
  try { localStorage.setItem(STORAGE_KEY, muted ? "1" : "0"); } catch {}
  return muted;
}

// --- Helpers ---
function now(): number {
  return ctx ? ctx.currentTime : 0;
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

// --- Engine: pre-recorded sample crossfade (pmndrs/racing-game technique) ---
// Two looping samples — one idle, one high-rev — are crossfaded by speed,
// and both are pitch-shifted via playbackRate to match the throttle.
//
// The previous procedural attempts (oscillators, filtered noise) all
// sounded synthetic because synthesis cannot reproduce the spectral
// complexity of a real combustion engine. Samples can.

async function fetchBuffer(url: string): Promise<AudioBuffer | null> {
  if (!ctx) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[audio] failed to fetch ${url}: ${res.status}`);
      return null;
    }
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  } catch (e) {
    console.warn(`[audio] failed to load ${url}`, e);
    return null;
  }
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

  // Native playback rate at idle so the sound character matches the raw
  // file. setEngineSpeed will only push it slightly higher with speed.
  idleSrc.playbackRate.value = 1.0;
  revSrc.playbackRate.value = 1.0;

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

  // Pure 0..1 crossfade — engine bus handles overall volume.
  const idleVol = 1 - speedRatio;
  const revVol = speedRatio;
  engineNodes.idleGain.gain.setTargetAtTime(idleVol, t, 0.08);
  engineNodes.revGain.gain.setTargetAtTime(revVol, t, 0.08);

  // Modest pitch shift: 1.0 → 1.3. Stays close to native playback so
  // the engine keeps its real character; just slightly higher RPM with
  // speed. Wider ranges (1.35→1.7) sounded chipmunky and unnatural.
  const idleRate = 1.0 + speedRatio * 0.25;
  const revRate = 1.05 + speedRatio * 0.25;
  engineNodes.idleSrc.playbackRate.setTargetAtTime(idleRate, t, 0.08);
  engineNodes.revSrc.playbackRate.setTargetAtTime(revRate, t, 0.08);
}

export function stopEngine() {
  engineWanted = false;
  if (!engineNodes) return;
  const n = engineNodes;
  try { n.idleSrc.stop(); } catch {}
  try { n.revSrc.stop(); } catch {}
  try { n.idleSrc.disconnect(); } catch {}
  try { n.revSrc.disconnect(); } catch {}
  try { n.idleGain.disconnect(); } catch {}
  try { n.revGain.disconnect(); } catch {}
  try { n.bus.disconnect(); } catch {}
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
  try { sirenNodes.osc.stop(); } catch {}
  try { sirenNodes.osc.disconnect(); } catch {}
  try { sirenNodes.filter.disconnect(); } catch {}
  try { sirenNodes.gain.disconnect(); } catch {}
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

export function playPickup() {
  if (!ctx || !masterGain) return;
  const t = now();
  // Two-note arpeggio for a "ding!" — much more satisfying than a single sweep
  const notes = [880, 1320];
  notes.forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    const start = t + i * 0.06;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.6, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    o.connect(g);
    g.connect(masterGain!);
    o.start(start);
    o.stop(start + 0.2);
  });
}

export function playLevelUp() {
  if (!ctx || !masterGain) return;
  const t = now();
  const notes = [523, 659, 784, 1047]; // C E G C
  notes.forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = "square";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.5, t + i * 0.08 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.2);
    o.connect(g);
    g.connect(masterGain!);
    o.start(t + i * 0.08);
    o.stop(t + i * 0.08 + 0.22);
  });
}

export function playGameOver() {
  if (!ctx || !masterGain) return;
  const t = now();
  const notes = [523, 466, 392, 311]; // C Bb G Eb (descending)
  notes.forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = "sawtooth";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.15);
    g.gain.exponentialRampToValueAtTime(0.55, t + i * 0.15 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.15 + 0.4);
    o.connect(g);
    g.connect(masterGain!);
    o.start(t + i * 0.15);
    o.stop(t + i * 0.15 + 0.45);
  });
}

// Resume audio context after user gesture (mobile autoplay policy)
export function resumeAudio() {
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}
