// One-shot script: generate cop-radio voice files from the chatter pools
// using OpenAI's TTS API. Run once with `OPENAI_API_KEY` set in the env;
// outputs Opus files into `public/audio/radio/` plus a manifest JSON.
//
//   OPENAI_API_KEY=sk-... node scripts/generate-radio-voices.mjs
//   OPENAI_API_KEY=sk-... FORCE=1 node scripts/generate-radio-voices.mjs
//
// Without FORCE the script is idempotent — files that already exist on
// disk are skipped, so you can safely re-run after editing pools to fill
// in just the new lines. Pass FORCE=1 to overwrite everything (e.g. after
// changing the voice/instructions/model).
//
// Uses `gpt-4o-mini-tts` which accepts a free-form `instructions` field
// for delivery direction — that's the difference between "TTS reading a
// line" and "stressed cop screaming into a radio mic during a pursuit".
// Cost per full run is ~$0.10.

import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "audio", "radio");
const MANIFEST_PATH = join(OUT_DIR, "manifest.json");

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error("ERROR: set OPENAI_API_KEY in your environment.");
  process.exit(1);
}

const FORCE = process.env.FORCE === "1";
const MODEL = "gpt-4o-mini-tts";

// Per-role delivery profiles. The `instructions` field is the killer
// feature of `gpt-4o-mini-tts` — it actually reshapes how the line is
// read. Each role gets a distinct character so dispatch / unit / SWAT
// sound like three different people on the channel.
const ROLES = {
  dispatch: {
    voice: "onyx",
    speed: 1.25,
    instructions:
      "Speak as a veteran police dispatcher coordinating a high-speed " +
      "pursuit in progress. Voice is deep, slightly hoarse, urgent and " +
      "powerful. Fast clipped delivery. Sound like you've been doing " +
      "this for twenty years and you are barking orders into a radio " +
      "mic with controlled aggression. Cut your words short. No pauses.",
  },
  unit: {
    voice: "ash",
    speed: 1.3,
    instructions:
      "Speak as a stressed street cop in active high-speed pursuit, " +
      "almost shouting into a handheld radio mic mid-chase. Breathless, " +
      "urgent, intense. Fast and clipped. Sound like you're driving " +
      "Code 3 with sirens screaming and the suspect right in front of " +
      "you. Power and adrenaline in every word.",
  },
  swat: {
    voice: "onyx",
    speed: 1.15,
    instructions:
      "Speak as a tactical SWAT team commander calling in heavy backup " +
      "during a high-risk vehicle pursuit. Deep, authoritative, " +
      "controlled but urgent. Powerful and intimidating. Like a military " +
      "officer giving an order — clipped, deliberate, no wasted breath.",
  },
};

// --- Pools (kept in sync with src/world/radio.ts). Inlined here so the
// script has zero TS dependencies — it can run standalone with plain Node.
// The `voice` field is now a *role* name that maps into ROLES above.
const POOLS = {
  start: {
    voice: "dispatch",
    lines: [
      "All units, all units, ten-eighty in progress.",
      "Dispatch — we have a runner, Code 3.",
      "BOLO on a stolen vehicle, all units respond.",
      "Ten-eighty underway, requesting all available units.",
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
      "Ten twenty-three, I have eyes on the suspect.",
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
      "Ten ninety-nine! Officer in the water!",
      "We lost a unit in the river!",
      "Cruiser in the drink — get marine support!",
      "Officer down, repeat, in the water!",
      "He led us straight into the river!",
      "Man overboard! All units, man overboard!",
      "We've got a ten-fifty in the water!",
      "Unit submerged — request immediate rescue!",
    ],
  },
  swat_drown: {
    voice: "swat",
    lines: [
      "Tactical down! Tactical down hard!",
      "We just lost the heavy unit, repeat, lost!",
      "Tac unit in the water — get rescue rolling!",
      "Ten ninety-nine — SWAT submerged!",
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
      "Ten twenty-two, we lost the visual.",
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
      "Ten-fifty in the water. Suspect down.",
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

// --- OpenAI TTS call ---
// Uses gpt-4o-mini-tts so we can pass `instructions` for delivery style.
// The instructions field is what makes a TTS line read as "stressed cop
// barking into a radio mic" instead of "calm narrator reading a script".
async function synthesize(text, role) {
  const profile = ROLES[role];
  if (!profile) throw new Error(`unknown role: ${role}`);
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      voice: profile.voice,
      input: text,
      instructions: profile.instructions,
      response_format: "opus",
      speed: profile.speed,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI TTS ${res.status}: ${body}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = {};
  let generated = 0;
  let skipped = 0;

  for (const [event, pool] of Object.entries(POOLS)) {
    manifest[event] = { voice: pool.voice, count: pool.lines.length };
    for (let i = 0; i < pool.lines.length; i++) {
      const line = pool.lines[i];
      const filename = `${event}_${i}.opus`;
      const filepath = join(OUT_DIR, filename);
      if (!FORCE && await fileExists(filepath)) {
        skipped++;
        continue;
      }
      process.stdout.write(`  generating ${filename} … `);
      try {
        const buf = await synthesize(line, pool.voice);
        await writeFile(filepath, buf);
        process.stdout.write(`${(buf.length / 1024).toFixed(1)} KB\n`);
        generated++;
        // Small pacing delay to be polite to the API.
        await new Promise((r) => setTimeout(r, 80));
      } catch (err) {
        process.stdout.write(`FAILED\n`);
        console.error("    →", err.message);
        process.exit(1);
      }
    }
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nDone. Generated ${generated}, skipped ${skipped} existing.`);
  console.log(`Manifest written to ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
