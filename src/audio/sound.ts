/* Web Audio. Engine = pre-recorded MP3s crossfaded by speed (pmndrs/racing-game, MIT). SFX = oscillators + noise. */

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

  if (err || !created) return; /* Audio not supported — silently ignore */
  ctx = created.audioCtx;
  masterGain = created.gain;

  muted = storageGet(StorageKey.Muted) === "1";
  if (muted) masterGain.gain.value = 0;

  /* Fire-and-forget — the loop starts before the samples land. */
  loadEngineBuffers();
}

export function isMuted(): boolean {
  return muted;
}

/** Shared AudioContext + master bus for other audio modules. Returns null until initAudio() runs. */
export function getAudioContext(): AudioContext | null {
  return ctx;
}
export function getMasterGain(): GainNode | null {
  return masterGain;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (masterGain) masterGain.gain.value = muted ? 0 : MASTER_VOL;
  storageSet(StorageKey.Muted, muted ? "1" : "0");
  return muted;
}

/* Helpers */
function now(): number {
  return ctx ? ctx.currentTime : 0;
}

/** Stop (if a source) & disconnect audio nodes. Web Audio throws on double-stop / double-disconnect — swallowed. */
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

/* Engine */

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

/** Resolves after buffers load. Multiple callers share the in-flight promise → one fetch. */
function loadEngineBuffers(): Promise<void> {
  if (engineBuffers) return Promise.resolve();
  if (engineLoadPromise) return engineLoadPromise;

  engineLoadPromise = (async () => {
    const [idle, rev] = await Promise.all([fetchBuffer("/sounds/engine.mp3"), fetchBuffer("/sounds/accelerate.mp3")]);

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

  /* idleGain/revGain: crossfade only (0..1, clean signal). Bus pre-gains to compensate for masterGain (0.4). */
  idleGain.gain.value = 1.0; /* start at idle (will be updated by setEngineSpeed) */
  revGain.gain.value = 0;
  bus.gain.value = 1.3;

  /* Start rates match setEngineSpeed baselines — no pop. rev = high-RPM, played slower (pmndrs). */
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

/* Engine-on intent. Lets async-load skip build if user died before buffers arrived. */
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

  /* Volumes (pmndrs model): idle = 1-speed/max, rev = 0.6*speed/max. rev capped lower — accelerate.mp3 is naturally louder. */
  const idleVol = 1 - speedRatio;
  const revVol = speedRatio * 0.6;
  engineNodes.idleGain.gain.setTargetAtTime(idleVol, t, 0.08);
  engineNodes.revGain.gain.setTargetAtTime(revVol, t, 0.08);

  /* Rates (pmndrs): idle 1.0x→1.30x (low-RPM, sped up). rev 0.55x→0.85x (high-RPM, slowed). */
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

/* Siren: hi-lo two-tone (EU), discrete jumps every 0.55s. No 4-20Hz "insect wing" — never reads as a bug. */
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

/* One-shot SFX — peaks sit close to clip so they cut through the BGM. */
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

  /* Add a punchy sub-thump for body */
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
  spacing: number /* seconds between note onsets */;
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
  /* Two-note "ding!" — generic pickup, kept as a fallback for callers that don't pass a specific kind. */
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
  /* Sweep the band upward so it reads as "speed up" */
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

/** Combo "ladder" — pitch climbs every 5 combos. Tier = combo/5. Capped at 8 → musical, not piercing. */
export function playComboTier(tier: number) {
  const t = Math.max(0, Math.min(tier, 8));
  /* Each tier is 2 semitones up from the last */
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
  /* C E G C — major arpeggio */
  playArpeggio({ notes: [523, 659, 784, 1047], type: "square", spacing: 0.08, attack: 0.02, peak: 0.5, decay: 0.2 });
}

/** Score milestone — higher/triumphant-er than level-up so back-to-back events feel distinct. */
export function playMilestone() {
  playArpeggio({
    notes: [659, 988, 1319, 1568],
    type: "triangle",
    spacing: 0.06,
    attack: 0.01,
    peak: 0.55,
    decay: 0.22,
  });
}

/** Warm 2-note on chase escape. Distinct from pickup SFX so "ESCAPED!" reads as its own moment. */
export function playEscape() {
  playArpeggio({
    notes: [784, 1175],
    type: "triangle",
    spacing: 0.07,
    attack: 0.01,
    peak: 0.5,
    decay: 0.25,
  });
}

/** Low-HP heartbeat: sub-thump at HP-scaled interval (scheduled by main.ts). Sits in sub-bass. */
export function playHeartbeat(intensity: number) {
  if (!ctx || !masterGain) return;
  const t = now();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(80, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  const peak = 0.4 + intensity * 0.4;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g);
  g.connect(masterGain);
  o.start(t);
  o.stop(t + 0.2);
}

export function playGameOver() {
  /* C Bb G Eb — descending sting */
  playArpeggio({ notes: [523, 466, 392, 311], type: "sawtooth", spacing: 0.15, attack: 0.03, peak: 0.55, decay: 0.4 });
}

/* BGM: 4-chord loop, triangle bass + square pad. Dedicated duck node — chase reads cleaner over sirens. */
type IBgmNodes = {
  bus: GainNode;
  duck: GainNode;
  schedulerInterval: number;
  oscs: OscillatorNode[];
};

let bgmNodes: IBgmNodes | null = null;

const BGM_BPM = 110;
const BGM_BEAT = 60 / BGM_BPM;

/* Cmin progression (Cm - Ab - Eb - Bb), 2 beats per chord, 4 chords = 8 beats */
const BGM_PROGRESSION: number[][] = [
  [130.81, 155.56, 196.0] /* Cm */,
  [103.83, 130.81, 155.56] /* Ab */,
  [155.56, 196.0, 233.08] /* Eb */,
  [116.54, 146.83, 174.61] /* Bb */,
];

function scheduleBgmBar(startTime: number) {
  if (!ctx || !bgmNodes) return;

  for (let i = 0; i < BGM_PROGRESSION.length; i++) {
    const chord = BGM_PROGRESSION[i];
    const t = startTime + i * 2 * BGM_BEAT;
    /* Bass note (root, octave down) on the downbeat */
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

    /* Pad (chord triad) — quieter, square wave through implicit smoothing */
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

  /* Trim the osc list so it doesn't grow unbounded — stopped oscs auto-disconnect */
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

  /* Schedule first bar immediately, then every 8 beats */
  let nextBarStart = now() + 0.05;
  scheduleBgmBar(nextBarStart);
  nextBarStart += 8 * BGM_BEAT;

  bgmNodes.schedulerInterval = window.setInterval(() => {
    if (!ctx || !bgmNodes) return;

    /* Stay 1.5 bars ahead of current time */
    while (nextBarStart < now() + 1.5 * 8 * BGM_BEAT) {
      scheduleBgmBar(nextBarStart);
      nextBarStart += 8 * BGM_BEAT;
    }
  }, 500);
}

export function setBgmDuck(amount: number) {
  /* amount 0..1 — at 1, music is 30% as loud */
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

/* Resume audio context after user gesture (mobile autoplay policy) */
export function resumeAudio() {
  if (ctx?.state === "suspended") {
    attemptAsync(() => ctx!.resume());
  }
}

/* Radio hiss: low-vol loop noise + bandpass → "open channel" feel. Stops on gameover (dying slow-mo plays in silence). */

let radioHissNodes: {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
} | null = null;

export function startRadioHiss() {
  if (!ctx || !masterGain || radioHissNodes) return;
  /* 2-second noise loop — long enough that the loop point isn't audible. */
  const buf = noiseBuffer(2.0);
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  /* Narrow bandpass on speech-radio range + gentle Q → "tinny squelch" not pure white noise. */
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 1.4;

  const gain = ctx.createGain();
  gain.gain.value = 0.06; /* very quiet — must sit under the BGM + engine */

  /* LFO modulates gain so hiss "breathes" like a live channel (PD squelch gating between transmissions). */
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.35;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.02; /* ±0.02 around the 0.06 base */
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  src.start();
  lfo.start();
  radioHissNodes = { src, filter, gain, lfo, lfoGain };
}

export function stopRadioHiss() {
  if (!radioHissNodes) return;
  const t = now();
  /* Quick fade so the channel cuts out cleanly without a click on game over. */
  radioHissNodes.gain.gain.cancelScheduledValues(t);
  radioHissNodes.gain.gain.setValueAtTime(radioHissNodes.gain.gain.value, t);
  radioHissNodes.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  const nodes = radioHissNodes;
  radioHissNodes = null;

  setTimeout(() => {
    safeDispose(nodes.src, nodes.lfo, nodes.lfoGain, nodes.filter, nodes.gain);
  }, 200);
}

/** "Kchk" radio static — punctuates each chatter line. 2 staggered bandpassed noise bursts → PTT key feel. */
export function playRadioStatic() {
  if (!ctx || !masterGain) return;
  const buf = noiseBuffer(0.18);
  if (!buf) return;
  const t = now();

  /* First burst — short squelch tail at the start of the line. */
  const src1 = ctx.createBufferSource();
  const filter1 = ctx.createBiquadFilter();
  const gain1 = ctx.createGain();
  src1.buffer = buf;
  filter1.type = "bandpass";
  filter1.frequency.value = 2200;
  filter1.Q.value = 6;
  src1.connect(filter1);
  filter1.connect(gain1);
  gain1.connect(masterGain);
  gain1.gain.setValueAtTime(0.0001, t);
  gain1.gain.exponentialRampToValueAtTime(0.45, t + 0.005);
  gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src1.start(t);
  src1.stop(t + 0.12);

  /* Second tighter chirp — completes the "kchk-chk" feel of a real PTT key. */
  const src2 = ctx.createBufferSource();
  const filter2 = ctx.createBiquadFilter();
  const gain2 = ctx.createGain();
  src2.buffer = buf;
  filter2.type = "bandpass";
  filter2.frequency.value = 1600;
  filter2.Q.value = 8;
  src2.connect(filter2);
  filter2.connect(gain2);
  gain2.connect(masterGain);
  gain2.gain.setValueAtTime(0.0001, t + 0.11);
  gain2.gain.exponentialRampToValueAtTime(0.3, t + 0.115);
  gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
  src2.start(t + 0.11);
  src2.stop(t + 0.18);
}
