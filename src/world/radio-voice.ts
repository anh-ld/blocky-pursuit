// Cop-radio voice playback. Loads pre-generated TTS files (made by
// `scripts/generate-radio-voices.mjs`) and routes them through a Web Audio
// "radio FX chain" so even mediocre TTS sounds like it's coming through a
// real police channel.
//
// FX chain (matches what film/game mixers actually use for radio voice):
//
//   source → highpass 400Hz → peaking 2kHz +5dB → lowpass 3400Hz →
//   waveshaper (mild saturation) → compressor (heavy) → make-up gain → out
//
// The bandpass narrows the spectrum to telephone bandwidth (≈300–3400 Hz),
// the peaking EQ adds the characteristic radio "honk", saturation
// introduces the warm distortion of an over-driven speaker, and the
// compressor flattens the dynamics so every word sits at the same forward
// loudness level — the same trick used on military comms and PD radios.

import { getAudioContext, getMasterGain, isMuted } from "../audio/sound";

type IManifestEntry = { voice: string; count: number };
type IManifest = Record<string, IManifestEntry>;

const MANIFEST_URL = "/audio/radio/manifest.json";
const FILE_URL = (event: string, idx: number) => `/audio/radio/${event}_${idx}.opus`;

let _manifest: IManifest | null = null;
let _manifestPromise: Promise<IManifest | null> | null = null;
const _bufferCache = new Map<string, AudioBuffer>();
const _inFlight = new Map<string, Promise<AudioBuffer | null>>();

// Last started source — kept so the next radio call can cancel a still-
// playing line. Real PD radios are half-duplex; the new key-up always
// preempts whatever's currently on the channel.
let _activeSource: AudioBufferSourceNode | null = null;
let _activeGain: GainNode | null = null;

// --- Radio FX chain ---
//
// Built lazily on first playback (after `initAudio` has run so the shared
// context exists). The chain is a single static graph that every voice
// line is routed through, so the radio character is consistent across
// dispatch / unit / SWAT instead of being re-tweaked per line.
type IRadioFx = { input: GainNode; ctx: AudioContext };
let _fx: IRadioFx | null = null;

function makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  // Soft tanh saturation curve. Higher `amount` = more crunch. The output
  // is normalized so peaks stay at ±1, preserving headroom.
  // Allocated through an explicit ArrayBuffer so the resulting typed array
  // matches `WaveShaperNode.curve`'s expected `Float32Array<ArrayBuffer>`
  // (rather than the wider `ArrayBufferLike` default).
  const samples = 1024;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  const norm = Math.tanh(amount);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(amount * x) / norm;
  }
  return curve;
}

function buildFx(ctx: AudioContext, dest: AudioNode): IRadioFx {
  const input = ctx.createGain();
  // Heavier pre-gain so the saturator clips more aggressively — the "the
  // cop is shouting into the mic" character comes from this.
  input.gain.value = 2.4;

  // Telephone bandpass — kills sub-bass rumble and the "natural" highs
  // that betray the voice as un-radioed. Tightened from 400-3400 to
  // 500-3200 for a more radio-clipped feel.
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 500;
  hp.Q.value = 0.7;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  lp.Q.value = 0.7;

  // Peaking EQ in the upper-mids gives the radio "honk" — the formant
  // squashing real radios produce. +7dB around 2kHz, narrower Q.
  const honk = ctx.createBiquadFilter();
  honk.type = "peaking";
  honk.frequency.value = 2000;
  honk.Q.value = 1.6;
  honk.gain.value = 7;

  // Second peaking EQ at 3.2kHz adds "presence" — the bite of someone
  // actively shouting close to the mic.
  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3200;
  presence.Q.value = 1.4;
  presence.gain.value = 4;

  // Saturation. Pushed harder for the "urgent / blown speaker" character.
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSaturationCurve(3.6);
  shaper.oversample = "2x";

  // Heavy compression so every word sits at the same in-your-face level.
  // Real police comms compressors hit ratios of 10:1+ with fast attack.
  // Pushed from 12:1 → 16:1, threshold lowered for more crunch.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -32;
  comp.knee.value = 4;
  comp.ratio.value = 16;
  comp.attack.value = 0.002;
  comp.release.value = 0.18;

  // Make-up gain after the compressor pulls the level back up. Pushed
  // higher so the radio sits FORWARD in the mix, not behind the engine.
  const output = ctx.createGain();
  output.gain.value = 1.9;

  input.connect(hp);
  hp.connect(honk);
  honk.connect(presence);
  presence.connect(lp);
  lp.connect(shaper);
  shaper.connect(comp);
  comp.connect(output);
  output.connect(dest);

  return { input, ctx };
}

function ensureFx(): IRadioFx | null {
  if (_fx) return _fx;
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return null;
  _fx = buildFx(ctx, master);
  return _fx;
}

// --- Manifest + buffer loading ---

async function loadManifest(): Promise<IManifest | null> {
  if (_manifest) return _manifest;
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = (async () => {
    try {
      const res = await fetch(MANIFEST_URL);
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      _manifest = (await res.json()) as IManifest;
      return _manifest;
    } catch (err) {
      console.warn("[radio-voice] manifest load failed", err);
      return null;
    }
  })();
  return _manifestPromise;
}

async function loadBuffer(event: string, idx: number): Promise<AudioBuffer | null> {
  const key = `${event}_${idx}`;
  const cached = _bufferCache.get(key);
  if (cached) return cached;
  const inFlight = _inFlight.get(key);
  if (inFlight) return inFlight;

  const ctx = getAudioContext();
  if (!ctx) return null;

  const promise = (async () => {
    try {
      const res = await fetch(FILE_URL(event, idx));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      _bufferCache.set(key, buf);
      _inFlight.delete(key);
      return buf;
    } catch (err) {
      console.warn(`[radio-voice] failed to load ${key}`, err);
      _inFlight.delete(key);
      return null;
    }
  })();
  _inFlight.set(key, promise);
  return promise;
}

/**
 * Background-preload every voice file in batches. Called once after the
 * first run begins so the player gets all subsequent lines instantly. The
 * batch size keeps us from opening 95 parallel HTTP requests at once.
 */
let _preloadStarted = false;
export async function preloadRadioVoices(): Promise<void> {
  if (_preloadStarted) return;
  _preloadStarted = true;
  const manifest = await loadManifest();
  if (!manifest) return;

  const tasks: Array<{ event: string; idx: number }> = [];
  for (const [event, entry] of Object.entries(manifest)) {
    for (let i = 0; i < entry.count; i++) tasks.push({ event, idx: i });
  }
  const BATCH = 6;
  for (let i = 0; i < tasks.length; i += BATCH) {
    const slice = tasks.slice(i, i + BATCH);
    await Promise.all(slice.map((t) => loadBuffer(t.event, t.idx)));
  }
}

/**
 * Pick a random voice line for the given event and play it through the
 * radio FX chain. Half-duplex — cancels any line currently playing so the
 * channel only has one voice on it at a time. Mute-aware.
 *
 * Returns true if playback started, false if the event is unknown, the
 * audio context isn't ready, or the player is muted.
 */
export async function playRadioVoice(event: string): Promise<boolean> {
  if (isMuted()) return false;
  const manifest = await loadManifest();
  if (!manifest) return false;
  const entry = manifest[event];
  if (!entry || entry.count === 0) return false;

  const idx = Math.floor(Math.random() * entry.count);
  const buf = await loadBuffer(event, idx);
  if (!buf) return false;

  const fx = ensureFx();
  const ctx = getAudioContext();
  if (!fx || !ctx) return false;

  // Cancel any previously playing line.
  if (_activeSource && _activeGain) {
    const t = ctx.currentTime;
    try {
      _activeGain.gain.cancelScheduledValues(t);
      _activeGain.gain.setValueAtTime(_activeGain.gain.value, t);
      _activeGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      const oldSrc = _activeSource;
      setTimeout(() => {
        try { oldSrc.stop(); } catch { /* already stopped */ }
        try { oldSrc.disconnect(); } catch { /* noop */ }
      }, 60);
    } catch { /* noop */ }
    _activeSource = null;
    _activeGain = null;
  }

  // Per-line envelope gain so we can fade out cleanly on cancel.
  const env = ctx.createGain();
  env.gain.value = 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(env);
  env.connect(fx.input);
  src.onended = () => {
    if (_activeSource === src) {
      _activeSource = null;
      _activeGain = null;
    }
    try { src.disconnect(); } catch { /* noop */ }
    try { env.disconnect(); } catch { /* noop */ }
  };
  src.start();
  _activeSource = src;
  _activeGain = env;
  return true;
}

/** Stop the currently playing line — used on game-over and pause. */
export function stopRadioVoice(): void {
  if (!_activeSource) return;
  try { _activeSource.stop(); } catch { /* noop */ }
  try { _activeSource.disconnect(); } catch { /* noop */ }
  _activeSource = null;
  _activeGain = null;
}
