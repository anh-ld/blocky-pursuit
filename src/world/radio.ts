/* Procedural cop-radio chatter. State machine: gameplay events → text bubbles in a Preact signal for the HUD. */
/* Lines are random picks from per-event pools, throttled so chaos can't spam. */
/* Each line is voiced via radio-voice — pre-generated OpenAI TTS through a Web Audio "radio FX" chain. */
/* Web Speech API path removed — OS TTS quality is unacceptable (see ADR in radio-voice.ts). */

import { signal } from "@preact/signals";
import { playRadioStatic } from "../audio/sound";
import { playRadioVoice, stopRadioVoice } from "./radio-voice";

export type IRadioLine = {
  id: number;
  text: string;
  /** Wall-clock seconds when the line was emitted (for fade-out). */
  ts: number;
  /** Voice tag drives the small color accent on the bubble. */
  voice: "dispatch" | "unit" | "swat";
};

/* Public signal — read by `<Radio />` to render the feed. */
export const radioLines = signal<IRadioLine[]>([]);

/* Tuning */
const MAX_VISIBLE = 3;
const LINE_LIFETIME_MS = 4500;
const MIN_GAP_MS = 350; /* throttle: drop events fired faster than this */
const PER_EVENT_COOLDOWN_MS = 1200; /* dedupe same event firing twice in a row */

let _nextId = 1;
let _lastEmitMs = 0;
const _eventLastMs: Record<string, number> = {};

/* Line pools per event. Keep short — read at a glance during a chase. Cop-radio voice: clipped, urgent. */
/* 10-codes used: 10-4 acknowledged 10-20 location 10-23 on scene 10-50 accident 10-80 pursuit 10-99 officer down */
/* Code 3 lights/sirens urgent · Code 4 no further help needed · BOLO be on lookout */
/* Mix with plain English for scannable + authentic dispatcher patter. */

const POOLS: Record<string, { voice: IRadioLine["voice"]; lines: string[] }> = {
  start: {
    voice: "dispatch",
    lines: [
      "All units, all units, 10-80 in progress.",
      "Dispatch — we have a runner, Code 3.",
      "BOLO on a stolen vehicle, all units respond.",
      "10-80 underway, requesting all available units.",
      "Subject fleeing, lights and sirens authorized.",
      "All units, suspect vehicle on the move. Engage.",
      "Be advised — pursuit is active, Code 3.",
      "Dispatch to all units, suspect heading your way.",
    ],
  },
  cop_spawn: {
    voice: "unit",
    lines: [
      "Adam-12, en route.",
      "Unit 19, moving to intercept.",
      "10-23, I have eyes on the suspect.",
      "Coming up on his six.",
      "Unit 7, cutting him off at the next block.",
      "Charlie unit closing in from the north.",
      "Roger that, on approach.",
      "Bravo unit, taking the parallel street.",
      "Show me responding, Code 3.",
      "Got him on visual — moving in.",
    ],
  },
  swat_spawn: {
    voice: "swat",
    lines: [
      "Tactical unit deploying. Stand clear.",
      "SWAT on the field. Hold your positions.",
      "Heavy unit inbound — give us room.",
      "Tactical on scene. We're taking lead.",
      "SWAT engaging. Stay back, all units.",
      "Tac unit live. Repeat, tac unit live.",
    ],
  },
  near_miss: {
    voice: "unit",
    lines: [
      "He's juking us, dispatch!",
      "Damn, this guy can drive.",
      "He just slipped right past me!",
      "Negative on the contact — he's threading us.",
      "Can't get a clean angle on him.",
      "Suspect is too quick!",
      "He's weaving through us like nothing.",
      "I lost the line — he's slipping the box.",
    ],
  },
  combo_big: {
    voice: "dispatch",
    lines: [
      "He's making fools of you out there!",
      "Box him in — what are you waiting for?",
      "All units, tighten up the perimeter!",
      "Get it together! He's running circles!",
      "You're letting him dictate the chase!",
      "Cut him off! Cut him off now!",
    ],
  },
  damage: {
    voice: "unit",
    lines: [
      "Contact! Contact made!",
      "Side-swiped the suspect, repeat, contact!",
      "We hit him hard — he's still rolling.",
      "PIT attempt made, he's still moving.",
      "Took a piece of him on that pass.",
      "Got him on the rear quarter!",
      "Solid hit, dispatch — he's not stopping.",
    ],
  },
  cop_drown: {
    voice: "dispatch",
    lines: [
      "10-99! Officer in the water!",
      "We lost a unit in the river!",
      "Cruiser in the drink — get marine support!",
      "Officer down, repeat, in the water!",
      "He led us straight into the river!",
      "Man overboard! All units, man overboard!",
      "We've got a 10-50 in the water!",
      "Unit submerged — request immediate rescue!",
    ],
  },
  swat_drown: {
    voice: "swat",
    lines: [
      "Tactical down! Tactical down hard!",
      "We just lost the heavy unit, repeat, lost!",
      "Tac unit in the water — get rescue rolling!",
      "10-99 — SWAT submerged!",
    ],
  },
  emp: {
    voice: "dispatch",
    lines: [
      "What the hell just happened?!",
      "All units, status check! Multiple units down!",
      "He's got some kind of pulse weapon!",
      "Multiple cruisers offline at once!",
      "Get me a status — half the units just dropped!",
      "Be advised, suspect has a disabling weapon!",
    ],
  },
  tank_kill: {
    voice: "unit",
    lines: [
      "He just rammed straight through us!",
      "He took out another cruiser, head-on!",
      "Cruiser totaled, he's still moving!",
      "He's plowing through the roadblock!",
      "Unit destroyed — he didn't even slow down!",
    ],
  },
  level_up: {
    voice: "dispatch",
    lines: [
      "Escalating — call in additional units.",
      "He's getting bolder. Pour it on.",
      "Bring everybody in. I want a wall.",
      "Step it up out there, suspect is gaining ground.",
      "All units, tighten the noose.",
      "He's not slowing down — neither do we.",
    ],
  },
  escape: {
    voice: "unit",
    lines: [
      "Negative visual — we lost him.",
      "Suspect off the grid, all units.",
      "I've got nothing. He's gone.",
      "Where the hell did he go?",
      "Negative contact, dispatch.",
      "Lost him in the alleys.",
      "10-22, we lost the visual.",
    ],
  },
  wrecked: {
    voice: "dispatch",
    lines: [
      "Suspect vehicle down. Code 4.",
      "Target neutralized — Code 4 the area.",
      "Pursuit terminated. Suspect wrecked.",
      "We got him. Suspect vehicle is down.",
      "Code 4, all units, suspect is wrecked.",
    ],
  },
  drowned_self: {
    voice: "dispatch",
    lines: [
      "Suspect vehicle in the river. Pursuit over.",
      "He's in the drink. Code 4.",
      "Suspect submerged — pursuit terminated.",
      "10-50 in the water. Suspect down.",
    ],
  },
  busted: {
    voice: "unit",
    lines: [
      "Suspect in custody. Code 4.",
      "Got him! Cuffs on, pursuit over.",
      "Hands up! Get out of the vehicle!",
      "Suspect contained. Code 4 the area.",
      "We got him, dispatch. He's done.",
    ],
  },
};

/**
 * Push a chatter line for a gameplay event. Throttled and deduped — calls
 * that arrive too fast or too soon after the same event are silently
 * dropped instead of crowding the feed.
 */
export function pushChatter(event: string): void {
  const pool = POOLS[event];
  if (!pool) return;
  const now = performance.now();
  if (now - _lastEmitMs < MIN_GAP_MS) return;
  if (now - (_eventLastMs[event] ?? -Infinity) < PER_EVENT_COOLDOWN_MS) return;
  _lastEmitMs = now;
  _eventLastMs[event] = now;

  const text = pool.lines[Math.floor(Math.random() * pool.lines.length)];
  const line: IRadioLine = { id: _nextId++, text, ts: now, voice: pool.voice };

  /* Append + trim to MAX_VISIBLE. New array ref so signal subscribers re-render; ages out via time-based fade in component. */
  const next = [...radioLines.value, line];
  if (next.length > MAX_VISIBLE) next.splice(0, next.length - MAX_VISIBLE);
  radioLines.value = next;

  /* Schedule removal so feed clears even when nothing else happens. setTimeout keeps module game-loop independent. */
  setTimeout(() => {
    radioLines.value = radioLines.value.filter((l) => l.id !== line.id);
  }, LINE_LIFETIME_MS);

  /* Audio: PTT squelch + voiced line. Mute-aware via sound module's mute toggle. Voice is async — fire-and-forget. */
  playRadioStatic();
  /* Map event names to voice file slots. Slot name matches the POOLS key (what the generator wrote to disk). */
  void playRadioVoice(event);
}

/** Wipe all chatter (called on run start so a fresh run isn't pre-populated). */
export function clearChatter(): void {
  radioLines.value = [];
  _lastEmitMs = 0;
  for (const k of Object.keys(_eventLastMs)) delete _eventLastMs[k];
  stopRadioVoice();
}
