// Web Audio sound system. Engine uses pre-recorded MP3 samples crossfaded
// by speed (technique borrowed from pmndrs/racing-game, MIT licensed).
// Other sounds are generated procedurally from oscillators + noise.

import { attempt, attemptAsync } from "es-toolkit";
import { StorageKey, storageGet, storageSet } from "../storage";

const MASTER_VOL = 0.4;

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

  muted = storageGet(StorageKey.Muted) === "1";
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
  storageSet(StorageKey.Muted, muted ? "1" : "0");
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
  // Two-note "ding!" — generic pickup, kept as a fallback for callers that
  // don't pass a specific kind.
  playArpeggio({ notes: [880, 1320], type: "triangle", spacing: 0.06, attack: 0.01, peak: 0.6, decay: 0.18 });
}

/** Healing pickups (repair, shield) — warm rising triad. */
export function playPickupHeal() {
  playArpeggio({ notes: [523, 659, 784], type: "triangle", spacing: 0.05, attack: 0.01, peak: 0.55, decay: 0.22 });
}

/** Shield pickup — short metallic ring above the heal palette. */
export function playPickupShield() {
  playArpeggio({ notes: [988, 1318], type: "sine", spacing: 0.05, attack: 0.005, peak: 0.55, decay: 0.22 });
}

/** Offensive pickups (EMP, Tank) — low→high zap. */
export function playPickupOffense() {
  playArpeggio({ notes: [330, 660, 880], type: "sawtooth", spacing: 0.04, attack: 0.005, peak: 0.5, decay: 0.18 });
}

/** Score / utility pickups (doubleScore, magnet, timeWarp, ghost) — bright two-note. */
export function playPickupScore() {
  playArpeggio({ notes: [988, 1480], type: "square", spacing: 0.05, attack: 0.008, peak: 0.5, decay: 0.18 });
}

/** Nitro pickup — short noise whoosh layered over the score ding. */
export function playNitroWhoosh() {
  if (!ctx || !masterGain) return;
  const buf = noiseBuffer(0.35);
  if (!buf) return;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = buf;
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  const t = now();
  // Sweep the band upward so it reads as "speed up"
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.exponentialRampToValueAtTime(2400, t + 0.32);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  envelope(gain, 0.005, 0.7, 0.32);
  src.start();
}

/** Tiny tick used to warn the player their combo is about to drop. */
export function playComboTick() {
  if (!ctx || !masterGain) return;
  const t = now();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.value = 1760;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g);
  g.connect(masterGain);
  o.start(t);
  o.stop(t + 0.08);
}

/** Soft descending sting played when a high combo expires. */
export function playComboLost() {
  playArpeggio({ notes: [880, 660, 440], type: "triangle", spacing: 0.07, attack: 0.01, peak: 0.45, decay: 0.22 });
}

/**
 * Combo milestone "ladder" — pitch climbs every 5 combos so the player
 * hears their multiplier rising. Tier = combo / 5. Capped at 8 to keep
 * the high end musical instead of piercing.
 */
export function playComboTier(tier: number) {
  const t = Math.max(0, Math.min(tier, 8));
  // Each tier is 2 semitones up from the last
  const base = 660 * Math.pow(2, (t * 2) / 12);
  playArpeggio({
    notes: [base, base * 1.5],
    type: "triangle",
    spacing: 0.05,
    attack: 0.005,
    peak: 0.5,
    decay: 0.14,
  });
}

export function playLevelUp() {
  // C E G C — major arpeggio
  playArpeggio({ notes: [523, 659, 784, 1047], type: "square", spacing: 0.08, attack: 0.02, peak: 0.5, decay: 0.2 });
}

export function playGameOver() {
  // C Bb G Eb — descending sting
  playArpeggio({ notes: [523, 466, 392, 311], type: "sawtooth", spacing: 0.15, attack: 0.03, peak: 0.55, decay: 0.4 });
}

// --- BGM (procedural, looping chord progression) ---
// Simple driving-game vibe: 4-chord loop on a triangle bass + square pad,
// scheduled note-by-note. Ducks via a dedicated gain node when sirens
// get loud so the chase reads cleaner.
type IBgmNodes = {
  bus: GainNode;
  duck: GainNode;
  schedulerInterval: number;
  oscs: OscillatorNode[];
};
let bgmNodes: IBgmNodes | null = null;

const BGM_BPM = 110;
const BGM_BEAT = 60 / BGM_BPM;
// Cmin progression (Cm - Ab - Eb - Bb), 2 beats per chord, 4 chords = 8 beats
const BGM_PROGRESSION: number[][] = [
  [130.81, 155.56, 196.0], // Cm
  [103.83, 130.81, 155.56], // Ab
  [155.56, 196.0, 233.08], // Eb
  [116.54, 146.83, 174.61], // Bb
];

function scheduleBgmBar(startTime: number) {
  if (!ctx || !bgmNodes) return;
  for (let i = 0; i < BGM_PROGRESSION.length; i++) {
    const chord = BGM_PROGRESSION[i];
    const t = startTime + i * 2 * BGM_BEAT;
    // Bass note (root, octave down) on the downbeat
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = "triangle";
    bass.frequency.value = chord[0] / 2;
    bassGain.gain.setValueAtTime(0.0001, t);
    bassGain.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, t + 2 * BGM_BEAT - 0.05);
    bass.connect(bassGain);
    bassGain.connect(bgmNodes.bus);
    bass.start(t);
    bass.stop(t + 2 * BGM_BEAT);
    bgmNodes.oscs.push(bass);

    // Pad (chord triad) — quieter, square wave through implicit smoothing
    for (const note of chord) {
      const pad = ctx.createOscillator();
      const padGain = ctx.createGain();
      pad.type = "square";
      pad.frequency.value = note;
      padGain.gain.setValueAtTime(0.0001, t);
      padGain.gain.exponentialRampToValueAtTime(0.04, t + 0.1);
      padGain.gain.exponentialRampToValueAtTime(0.0001, t + 2 * BGM_BEAT - 0.05);
      pad.connect(padGain);
      padGain.connect(bgmNodes.bus);
      pad.start(t);
      pad.stop(t + 2 * BGM_BEAT);
      bgmNodes.oscs.push(pad);
    }
  }
  // Trim the osc list so it doesn't grow unbounded — stopped oscs auto-disconnect
  if (bgmNodes.oscs.length > 200) {
    bgmNodes.oscs.splice(0, bgmNodes.oscs.length - 200);
  }
}

export function startBgm() {
  if (!ctx || !masterGain || bgmNodes) return;
  const bus = ctx.createGain();
  const duck = ctx.createGain();
  bus.gain.value = 0.5;
  duck.gain.value = 1.0;
  bus.connect(duck);
  duck.connect(masterGain);
  bgmNodes = { bus, duck, schedulerInterval: 0, oscs: [] };

  // Schedule first bar immediately, then every 8 beats
  let nextBarStart = now() + 0.05;
  scheduleBgmBar(nextBarStart);
  nextBarStart += 8 * BGM_BEAT;

  bgmNodes.schedulerInterval = window.setInterval(() => {
    if (!ctx || !bgmNodes) return;
    // Stay 1.5 bars ahead of current time
    while (nextBarStart < now() + 1.5 * 8 * BGM_BEAT) {
      scheduleBgmBar(nextBarStart);
      nextBarStart += 8 * BGM_BEAT;
    }
  }, 500);
}

export function setBgmDuck(amount: number) {
  // amount 0..1 — at 1, music is 30% as loud
  if (!ctx || !bgmNodes) return;
  const target = 1 - amount * 0.7;
  bgmNodes.duck.gain.setTargetAtTime(target, now(), 0.15);
}

export function stopBgm() {
  if (!bgmNodes) return;
  clearInterval(bgmNodes.schedulerInterval);
  for (const o of bgmNodes.oscs) {
    attempt(() => o.stop());
    attempt(() => o.disconnect());
  }
  safeDispose(bgmNodes.bus, bgmNodes.duck);
  bgmNodes = null;
}

// Resume audio context after user gesture (mobile autoplay policy)
export function resumeAudio() {
  if (ctx?.state === "suspended") {
    attemptAsync(() => ctx!.resume());
  }
}
