# Blocky Pursuit — Gameplay Reference

A 3D voxel arcade chase game. The car drives itself; you steer. Outrun the
cops, build combos, lure them into water, survive as long as you can.
Endless run, no win condition — score is everything.

---

## 1. Core Loop

| Phase | What happens |
|---|---|
| **Boot** | Load → How-to-Play overlay → "Start" → Pre-Game (pick car + weather) → Run begins |
| **Run** | Auto-drive forward, steer, score by driving fast on roads, build combos, grab pickups, evade cops |
| **End** | One of: `WRECKED` (HP→0), `DROWNED` (drove into water), `BUSTED` (cornered + stopped) |
| **Game Over** | Score submitted, run summary shown, "Retry" returns to Pre-Game |

State machine: `start → playing ⇄ paused → gameover → playing`
(`src/main.ts:203`)

**Pause:** `Space` (also pauses on tab hidden). Engine, siren, BGM all stop.
The pause overlay is a 3-button modal: **Resume**, **Restart Run**, and
**Quit to Menu**. Restart re-runs `startGame()` directly so a bad start
can be abandoned without crashing on purpose.

---

## 2. Controls

| Input | Action |
|---|---|
| `A` / `←` | Steer left |
| `D` / `→` | Steer right |
| `Space` | Pause / resume |
| Touch L/R buttons | Steer (mobile) |

The car **drives itself**. You only steer. Steering authority drops with
speed; cars with high `stability` keep more authority at top speed.
(`src/entities/car-physics.ts:90`)

---

## 3. Player Car

- **Starting HP:** `100` (`src/systems/run-state.ts:31`)
- **Auto-drive force curve:** peak at standstill, tapers toward top speed.
- **Lateral grip ("drift"):** per-skin `gripFactor` 0.72–0.95. Lower = grippier.
- **Bounce-back on building hit:** ~1.25 s reverse + ~1.0 s recovery during
  which throttle is reduced and steering is loosened so you can re-aim.
  (`src/entities/car.ts:73`, `src/entities/car-physics.ts:36`)
- **Top speed cap** is enforced every physics step.

### Skins (Garage)

Pick at the **Pre-Game** screen. Locked skins show their unlock hint.

| # | Car | Top | Accel | Hand | Grip | Stab | Brake | Wt | End | Unlock |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | VinFast VF3 | 40 | 150k | 2.6 | 70 | 78 | 60 | 35 | 70 | Default |
| 2 | VW Beetle | 41 | 152k | 2.8 | 72 | 74 | 62 | 38 | 68 | Default |
| 3 | Mini Cooper | 42 | 158k | 3.0 | 78 | 70 | 68 | 32 | 55 | Default |
| 4 | Fiat 500 | 40 | 154k | 2.9 | 74 | 68 | 65 | 30 | 50 | Default |
| 5 | Porsche 911 | 47 | 175k | 3.0 | 85 | 80 | 75 | 40 | 50 | Best ≥ 500 |
| 6 | Ferrari F430 | 48 | 178k | 3.1 | 80 | 70 | 80 | 38 | 45 | Best ≥ 1.5k |
| 7 | Lamborghini Aventador | 51 | 185k | 2.7 | 65 | 55 | 70 | 70 | 38 | Best ≥ 3k |
| 8 | Ford Mustang GT | 45 | 188k | 2.4 | 45 | 65 | 50 | 85 | 80 | 10 total runs |
| 9 | Chevrolet Corvette C8 | 47 | 180k | 2.9 | 75 | 75 | 70 | 60 | 55 | Drown 15 cops |
| 10 | Nissan GT-R R35 | 49 | 182k | 3.1 | 90 | 90 | 85 | 75 | 65 | Best ≥ 5k |

Stats: `topSpeed` (game units), `acceleration` (raw force), `handling`
(turn rate), and 0–100 sliders for `grip / stability / braking / weight /
endurance`. Endurance reduces collision damage (`damageMul = 1 −
endurance/200`). Weight → cannon body mass `80 + weight·0.6`.
(`src/entities/car-skins.ts:112`)

---

## 4. World

- **Tile size:** 10 units. **Chunk:** 60 × 60 (6 × 6 tiles). City is
  generated procedurally around the player and streamed as you move.
  (`src/world/terrain.ts:1`)
- **Zones** (procedural noise):
  - **Downtown** — dense road grid, tall buildings.
  - **Suburbs** — sparser roads.
  - **Nature** — mostly off-road, contains **water** (rivers).
- **Roads** are the only safe surface. Off-road tiles are walkable but
  give no score and may be water.
- **Periodic roadblocks** every ~40 tiles break infinite straight roads;
  intersections are never blocked. (`src/world/terrain.ts:53`)
- **Water tiles** instantly drown anything that enters them.

---

## 5. Scoring

Score is a float, displayed as `floor(score)` in the HUD.

### Road-tile points
Each unique road tile you enter awards:

```
points = 1.5 × (1 + speedRatio) × comboMult
```
where `speedRatio = velocity / maxSpeed` (clamped 0–1) and
`comboMult = min(1 + 0.1·combo, 3)`.
(`src/systems/run-state.ts:80`)

### Other score sources

| Event | Reward |
|---|---|
| Drown a cop | **+30 score**, **+10 HP** |
| Drown / tank a **SWAT mini-boss** | **+80 score**, **+25 HP** |
| EMP-killed cop | **+30 score**, **+10 HP** (each) |
| Stun a civilian (impact > 6) | **+5 score** |
| Each near-miss in a combo | **+ combo·2** instant bonus |
| **Escape** (no cop within 60 u for 1.5 s) | **+50 score**, **+5 HP** |
| **Score milestone** (1k / 5k / 10k / 25k / 50k / 100k) | popup + flash + sting |

### Combo system
- A cop "arms" when farther than **18** units from you.
- Re-entering the band **6 ≤ d < 12** while armed = **+1 combo**.
- A real collision **resets combo to 0**.
- Combo decays after **3 s** of no new near-miss (`COMBO_DECAY`).
- Combo multiplier caps at **3.0×** (combo of 20).
- Every 5 combos → floating `xN` popup + rising-pitch ding (the
  "combo ladder" — pitch climbs 2 semitones per tier) + haptic buzz +
  **HUD combo number scale-pops** (CSS keyframe re-triggered via tier key).
- Every 10 combos → **time-slow** + screen flash + extra shake.
- The **first** combo of a player's career also spawns a tutorial popup
  ("COMBO! Skim past cops — don't touch!"), persisted via `bp:tutorial`.
  (`src/systems/cop-system.ts:96`, `src/systems/tutorial.ts`)
- **Combo lifeline:** at chain ≥ 5, when the decay timer falls below 25 %,
  the HUD combo chip turns red and pulses, and a high-pitched "tick" plays
  every 0.18 s. If a chain of **10 +** is allowed to expire, a soft "lost
  it" sting plays so the loss reads as its own moment.

### Score milestones
Crossing **1 000 / 5 000 / 10 000 / 25 000 / 50 000 / 100 000** score for
the first time in a run fires a gold popup with the milestone number, a
small screen flash, a triumphant sting (`playMilestone`), and a level-up
haptic buzz. Each milestone fires exactly once per run; `RunState.reset()`
walks the index back to 0 on restart.

### Escape reward
If **no cop is within 60 units** for **1.5 s** continuous, the run pays
out **+50 score** and **+5 HP** with an "ESCAPED!" popup, screen flash,
and a warm two-note sting (`playEscape`). It only arms once a cop has
*entered* the 60-unit range, so the first 4 seconds of a fresh run can't
trigger a freebie. After firing, it re-arms only when a new cop comes
back within range.

### Score multiplier (2× pickup)
While the **2X SCORE** pickup buff is active (8 s), every score source —
tile points, near-miss combo bonuses, drowned/EMP/tank cop kills — is
multiplied by **2**. Stacks with the combo multiplier, so a `x12` combo
during 2× yields `1.5 × 2 × 2.2 × 2 = 13.2` points per tile.

---

## 6. Levels

Levels are score-gated. Reaching one **heals +15 HP** and plays a level-up
cue. Cop count and spawn cadence rise with level; cop AI tier rises until
level 5 (count keeps rising past that, AI doesn't).

| Lvl | Score req. | Max cops | Spawn (s) |
|---|---|---|---|
| 1 | 0 | 3 | 4.0 |
| 2 | 100 | 5 | 3.0 |
| 3 | 300 | 6 | 2.5 |
| 4 | 600 | 7 | 2.0 |
| 5 | 1 000 | 8 | 1.5 |
| 6 | 1 500 | 9 | 1.3 |
| 7 | 2 200 | 10 | 1.1 |
| 8 | 3 000 | 11 | 1.0 |
| 9 | 4 000 | 12 | 0.9 |
| 10 | 5 500 | 13 | 0.8 |

Past level 10 the run enters **heat mode**: every additional **1 500
score** above 5 500 = **+1 heat tier**. Each tier shaves cop spawn
interval by **0.05 s** (floor **0.4 s**) so survivor runs keep escalating
instead of plateauing at LV10's 0.8 s cadence. The HUD shows a 🔥N chip
once heat > 0. (`src/systems/leveling.ts:14`)

---

## 7. Cops

5 AI tiers, scaling with level:

| Tier | Lvl | Mass | Speed | Ram | Turn | Predict | Flank? |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 100 | 44 | 52 | 2.2 | 0.5 s | no |
| 2 | 2 | 115 | 46 | 55 | 2.5 | 0.8 s | no |
| 3 | 3 | 130 | 48 | 58 | 2.8 | 1.2 s | yes |
| 4 | 4 | 160 | 50 | 62 | 3.0 | 1.5 s | yes |
| 5 | 5 | 200 | 52 | 65 | 3.2 | 1.8 s | yes |

Cops outclass the base player on top speed — you escape with combos,
weather, weight, and pickups, not raw straight-line speed.
(`src/entities/cop.ts:81`)

### Behaviors
- **Predict** the player's future position by `predictAhead` seconds.
- **Flank**: high-tier cops aim 12 units to the side of your heading.
- **Ram boost**: within 25 units they switch to `ramSpeed` (×1.4 force).
- **Despawn** at 100 units away.
- **Visual tier** (so threats read at a glance): black-and-white (lvl 1–2)
  → charcoal (lvl 3) → SWAT red (lvl 4–5). Sirens are globally phase-synced.

### Damage to player
On contact (within 5 units, impact speed > 3):

```
damage = (2 + (cop.mass/100) × impactSpeed × 0.3) × car.damageMul
```
1 s damage cooldown per cop, then it can hit again.
**Combo resets** on a real hit. Hit pause `0.05 s` plus screen shake.
(`src/systems/cop-system.ts:123`)

### Killing cops
- **Drown** them (lure them off-road into water): +30 score, +10 HP, +1 to
  the persistent `copsDrowned` counter.
- **EMP pickup**: AOE blast within 30 units → +30 score & +10 HP per kill.
- **Tank pickup**: ramming a cop wrecks it instead of damaging you →
  +25 score & +10 HP per kill.
There is no other way to kill a cop.

### SWAT mini-boss
At **level 5 +**, a heavier "mini-boss" cop spawns at most **one alive at
a time** with a **25 s** cooldown. SWAT cops are visually scaled **1.4×**,
use a black-and-red emissive material, run at **1.8×** mass and **1.3×**
forward force (so they hit harder and shrug off bumps), and are **immune
to EMP**. A `⚠ SWAT` popup spawns over the player when one appears so the
threat telegraphs. Killing one (drown or tank-ram) pays **+80 score**,
**+25 HP**, and triggers an extra confetti burst + screen flash + heavier
shake. (`src/systems/cop-system.ts`, `src/entities/cop.ts`)

---

## 8. Civilians

- Up to **8** at a time, spawned every **2 s**.
- Wander on roads. **No damage** to the player.
- Brushing past at low speed does nothing; an impact > 6 stuns them and
  awards **+5**. (`src/systems/civilian-system.ts`)
- **Flee reaction**: when the player is within **8 units** moving faster
  than **20**, they get a force shove away from the car. The first time
  each civilian panics, a `!!` popup spawns over them.
- They drown silently if they enter water.

---

## 9. Pickups

Spawned on a road tile near the player every **6 s**, max **4** alive.
Despawn at 80 units away or after **25 s**. Magnetism pulls them in within
**6** units (extended by the Magnet pickup — see below).

Each kind has a **distinct silhouette** so the player can read it at a
glance instead of decoding only the color. The first time the player ever
collects each kind, a tutorial popup explains it (persisted via
`bp:tutorial`).

| Kind | Shape | Color | Rarity | Weight | Effect | Duration |
|---|---|---|---|---|---|---|
| ⚡ **Nitro** | Cone | Orange | common | 30 | Top-speed × **1.55** + ghost trail | **3 s** |
| 🛡 **Shield** | Icosahedron | Cyan | common | 30 | Absorbs the next cop hit | until consumed |
| ➕ **Repair** | Greek cross | Green | common | 30 | **+40 HP** instant heal (clamped to 100) | instant |
| 💰 **2X Score** | Stacked cubes | Gold | rare | 10 | All score (tile + combo + cop kills) × **2** | **8 s** |
| 🧲 **Magnet** | 3/4 torus arc | Red | rare | 10 | Pickup magnet **range × 3** and **pull × 3** | **8 s** |
| ⏳ **Time Warp** | Octahedron | Sky blue | rare | 10 | Cops capped to **50%** of their max speed | **5 s** |
| 💥 **EMP** | Flat torus | Magenta | epic | 4 | AOE radius **30** — destroys all cops (except SWAT) in range, +30 / +10 HP per kill | instant |
| 👻 **Ghost** | Tapered cylinder, translucent | White | epic | 4 | Intangible to cops — no damage, no busted timer, no shield consumed | **3 s** |
| 💢 **Tank** | Tetrahedron | Dark red | epic | 4 | Ramming a cop **wrecks it instead of damaging you** (+25 score · +10 HP per kill, **+80 / +25 HP** vs SWAT) | **5 s** |

Total spawn weight: **132** (3 × 30 common + 3 × 10 rare + 3 × 4 epic).

### Rarity tiers + glow rings
- **Common** (~22.7% each) — base utility, no visual ring.
- **Rare** (~7.6% each) — flat **cyan** glow ring on the ground beneath
  the pickup mesh, breathing scale pulse, plus a **confetti puff at spawn**.
- **Epic** (~3% each) — flat **gold** glow ring + spawn confetti so the
  player notices a high-tier drop in their peripheral vision.

The ring is a child of the pickup group with its local Y counter-bobbed
each frame so it stays anchored at world y ≈ 0.05 while the pickup mesh
floats above. (`src/entities/pickup.ts`)

- **Nitro** stacks with weather modifiers via `setNitroMultiplier()`.
- **Shield** absorbs one hit and flashes confetti instead of damage.
- **EMP** awards `+30 score`, `+10 HP` and `+1` to the persistent
  `copsDrowned` counter per cop wiped.
- **Repair** heals the actual delta (so a popup `+12 HP` reads correctly
  if the player was at 88).
- **2X Score** is the only score amplifier in the game; it stacks
  multiplicatively with the combo multiplier.
- **Time Warp** doesn't kill cops, just slows them — letting the player
  weave through a swarm at full speed for combo gold.
- **Magnet** triples both the radius at which pickups start being pulled
  AND the pull strength — chain pickups together into a "loot run".
- **Ghost** also disables the busted check (intangible cops can't actually
  hold the player in place), so it's the only escape from a 4-cop pile-up.
- **Tank** wrecks count toward `copsDrowned` and award the same +10 HP as
  drowning, but use `TANK_KILL_SCORE = 25` instead of 30.

(`src/entities/pickup.ts`, `src/systems/pickup-system.ts`)

---

## 10. Weather

Pick at the Pre-Game screen. Weather changes the **sky, fog, lighting,
particles, AND your driving stats**.

| Weather | Top × | Accel × | Grip add | Particles |
|---|---|---|---|---|
| ☀ Sunny | 1.05 | 1.05 | 0.00 | — |
| ☁ Foggy | 0.95 | 1.00 | 0.00 | (short fog) |
| 🌧 Rainy | 0.92 | 0.90 | +0.04 (slippery) | rain streaks |
| 🌅 Sunset | 1.00 | 1.00 | 0.00 | — |
| ❄ Snowy | **0.80** | **0.75** | **+0.07** (very slippery) | snowflakes |

`gripAdd` is added to the per-skin `gripFactor` (clamped to 0.6–0.99) — a
positive value makes the car retain more lateral velocity, i.e. drift more.
Modifiers are reapplied whenever weather **or** skin changes. Nitro stacks
on top via `setNitroMultiplier()`. (`src/world/weather.ts`)

The Pre-Game weather row shows a 1-line summary of the active weather's
modifiers (e.g. *"−20% speed · −25% accel · very slippery"*) via
`getWeatherSummary()` so the choice is meaningful instead of cosmetic.

---

## 11. HP, Healing, Death

### Damage
- Cop collisions (formula above).
- Nothing else damages you. Buildings just bounce you back.

### Healing
| Trigger | Amount |
|---|---|
| Level up | **+15 HP** |
| Drown / EMP a cop | **+10 HP** |
| Speed-streak: 5 s sustained at ≥ 90 % top speed | **+5 HP** (then resets) |
| Passive regen: no cop within **30 units** | **+1 HP / s** |

HP is capped at **100**. (`src/main.ts:386`)

### Fail conditions
- **WRECKED** — HP reaches 0.
- **DROWNED** — car enters a water tile (instant).
- **BUSTED** — `≥ 2` cops within 8 units AND speed `< 2` for **3 s**
  continuous. The "busted timer" decays at 2× when you're moving or alone,
  so brief stalls are forgiven. (`src/main.ts:401`)

### Busted warning
While the busted timer is filling, a **pulsing red radial vignette** + a
`Busted in Xs — MOVE!` countdown render across the play area. The opacity
ramps with `bustedProgress = bustedTimer / 3s`, so the player sees the
threat building and can break free instead of dying silently.
(`src/ui/busted-warning.tsx`)

### Low-HP warning
When **HP drops below 30**, a **pulsing red screen-edge vignette** layers
on top of the game (intensity scales with `1 - hp/30`) and a low **sub-bass
heartbeat thump** schedules at an interval that ramps from **1.1 s** at HP
30 down to **0.45 s** at HP 1. Both visual and audio react to the same
`hp` signal so they're inherently in sync. The warning ends instantly at
HP 0 (death) or once HP recovers above 30. (`src/ui/low-hp-warning.tsx`)

### Damage direction indicator
Every damaging cop collision writes a `damageDirAngle` (world XZ angle
from the player to the offending cop) and increments a `damageDirSeq`
counter. The HUD overlay watches `damageDirSeq` and flashes a **400 ms
red gradient** at the screen edge in the threat direction so the player
learns which way to evade. The world→screen mapping accounts for the
foreshortened isometric up axis (`sy /= √3`).
(`src/ui/damage-indicator.tsx`)

### Death moment
On any fail condition, gameplay halts immediately but the game-over panel
is delayed by **700 ms** (`DEATH_MOMENT_MS`). During that window the game
plays a strong screen flash, big shake, confetti + double sparks burst at
the wreck, and (for `DROWNED`) a splash. Audio loops cut and the game-over
sting + death haptic fire. **If the run is a new best**, an extra 5
confetti bursts spawn at randomized offsets around the wreck so the
achievement lands *before* the panel even appears. The panel then pops in
with the run summary.

---

## 12. HUD

Top bar shows:
- **HP bar** (green > 60, yellow > 30, red ≤ 30)
- **SCORE** (integer)
- **LV** (current level) + thin orange **progress bar** showing the
  fraction of the way to the next level threshold
- **🔥N** heat tier chip (only past level 10 — see §6)
- **Combo** `xN` (with scale-pop on every milestone of 5) + `N.N×`
  multiplier + decay bar (only when combo > 0). Turns **red and pulses**
  when the combo is "in danger" (chain ≥ 5 with timer < 25 %).
- **⚡ Nitro** seconds remaining (only when active)
- **🛡 Shield** icon (only when active)
- **💰 2x Score** seconds remaining (only when active)
- **⏳ Time Warp** seconds remaining (only when active)
- **🧲 Magnet** seconds remaining (only when active)
- **👻 Ghost** seconds remaining (only when active)
- **💢 Tank** seconds remaining (only when active)

**Mobile responsive layout:** below the `sm` breakpoint the top bar
switches to `flex-nowrap` with the HUD in a `min-w-0 overflow-hidden`
group: HP bar shrinks from `w-25` → `w-16`, padding tightens, survival
time hides, and the rightmost buff chips clip off-edge if there's no
room. The pause + avatar group is `shrink-0` so it always stays visible
and clickable. The bar height is held at **52 px** via `h-13 min-h-13`.

In the play area itself:
- **Busted warning** vignette + countdown text — see §11.
- **Low-HP warning** vignette + heartbeat audio — see §11.
- **Damage direction indicator** red edge flash — see §11.

Cops within 40 units trigger a siren whose volume scales with how close
the nearest one is. (`src/main.ts:426`)

---

## 13. Game Over Screen

Shows:
- Reason: BUSTED / WRECKED / DROWNED
- Final score, **animated as a count-up from 0** over ~800 ms with an
  ease-out cubic curve so the panel lands like a payoff instead of a
  static dump of numbers (and ★ NEW BEST ★ if surpassed)
- Best · Time · Level
- Per-run summary: **Drowned**, **Best Combo**, **Top Speed**, **Distance** (m)
- Score breakdown: **Tile · Combo · Cops** so the player can see *how*
  they earned the total
- **Retry** → Pre-Game
- **Share Score** → Web Share API or clipboard fallback

Score is submitted to the Netlify leaderboard function on game over.

---

## 14. Persistence (localStorage)

| Key | Stores |
|---|---|
| `bp:progress` | `best`, `totalRuns`, `copsDrowned`, `selectedSkin` |
| `bp:muted` | mute state |
| `bp:tutorial` | one-time onboarding flags (`seenComboTip` + per-pickup `seenXTip` for all 9 kinds) |
| `blocky-pursuit-name` | player name (auto-generated on first run, **editable** in Pre-Game) |

The player name is editable from the **Pre-Game** screen — type into the
Player row and blur or press Enter to save. Sanitization mirrors the
server-side rules (`[^a-zA-Z0-9 _-]` stripped, capped at 20 chars). Names
shorter than 6 characters get a 4-digit numeric tag appended (`"A"` →
`"A4821"`) so the leaderboard stays unique. (`src/api.ts: setPlayerName`)

Skin unlocks are derived from the persisted `best`, `totalRuns`, and
`copsDrowned` counters. (`src/entities/car-skins.ts:357`)

Once `totalRuns ≥ 1`, the **How-to-Play** overlay also shows a career
strip with `Best · Runs · Drowned · Cars X/N` so progression is visible
between runs, not only on the game-over panel.

---

## 15. Audio & Haptics

- **Engine:** two pre-recorded loops (idle + rev) crossfaded by speed ratio.
- **Siren:** procedural square wave that toggles pitch ~6 Hz, volume scales
  with proximity to the nearest cop (off beyond 40 units).
- **BGM:** background music while playing, ducked when sirens get loud.
- **SFX:** crash, splash, level-up, game-over.
- **Per-pickup audio palette** — pickups sound distinct so the player can
  identify what they grabbed by ear without looking:
  - `playPickupHeal` — warm rising triad (Repair)
  - `playPickupShield` — short metallic ring (Shield)
  - `playPickupOffense` — low→high zap (EMP, Tank)
  - `playPickupScore` — bright two-note (2X Score, Magnet, Time Warp, Ghost)
  - `playNitroWhoosh` — band-pass noise sweep layered on top of the score
    ding when the player grabs a Nitro
- **Combo ladder:** rising-pitch ding every 5 combos, climbing 2 semitones
  per tier (capped at tier 8) so you can *hear* the multiplier rise.
- **Combo lifeline:** `playComboTick` (short 1760 Hz square click) every
  0.18 s while a 5+ chain is in danger; `playComboLost` (descending
  triangle sting) when a 10+ chain expires.
- **Score milestone:** `playMilestone` — triumphant 4-note triangle
  arpeggio when crossing 1k / 5k / 10k / 25k / 50k / 100k.
- **Escape:** `playEscape` — warm two-note triangle sting when the player
  shakes off all cops (see §5).
- **Heartbeat:** `playHeartbeat(intensity)` — single low sub-thump
  scheduled by `main.ts` at an interval that scales 1.1 s → 0.45 s with
  how close to dying the player is. Sits in the very low end so it
  doesn't fight other sounds.
- **Mute:** persisted across sessions (`bp:muted`).
- **Haptics** (mobile): semantic helpers via the Vibration API — pickup,
  hit, level-up, combo milestone, death. Auto-disabled when muted or when
  the device doesn't support `navigator.vibrate`.
  (`src/audio/sound.ts`, `src/audio/haptics.ts`)

---

## 15a. Visual Juice

Polish layers on top of the gameplay loop:

- **Pickup glow rings** — flat colored rings under rare/epic pickups
  (see §9).
- **Combo HUD scale-pop** — the combo number remounts via a tier key on
  every 5-combo milestone, retriggering a CSS keyframe at the same instant
  the milestone sound fires.
- **Death moment juice** — strong screen flash, big shake, confetti +
  double sparks burst at the wreck site, splash for `DROWNED`, plus 5
  extra randomized confetti bursts on a new best so the achievement lands
  *before* the panel even appears.
- **Combo big-milestone juice** — every 10 combos triggers a brief time
  slow + screen flash + extra shake.
- **Skid marks** — pooled flat dark quads laid at rear-wheel positions
  while the car is drifting hard or boosting on nitro.
- **Speed lines** — pooled white streak particles fired backward from the
  car at peak nitro speed.
- **Nitro ghost trail** — a 6-slot pool of fading box silhouettes
  captured every 0.06 s while `nitroTimer > 0`, color-matched to the
  active skin's body color via `setGhostTrailColor()`. Each ghost lives
  0.4 s and decays its opacity linearly. Y-offset by `CAR_UNIT` so the
  silhouette aligns with the visual chassis (the rigid body's shape is
  added with a `(0, unit, 0)` offset). Cleared on `startGame()` so a
  fresh run starts without trailing ghosts. (`src/world/ghost-trail.ts`)
- **Particles** — pooled mesh-based system with 256 slots; sparks,
  splashes, confetti, speed lines all emit through `acquire()` and
  release back to the pool on life expiry. (`src/world/effects.ts`)
- **Expanding rings** — a 4-slot ring pool used by EMP for the AOE
  visualization.

---

## 16. Mobile / PWA

- Two on-screen steering buttons (left / right) with multi-touch support.
- "Install App" prompt appears on supported mobile browsers.
- Renderer auto-resizes on `resize` and `orientationchange`.
- Standalone display-mode hides the install prompt.
- **Haptic feedback** on every meaningful event (pickup, hit, level-up,
  combo milestone, death) — see §15.

---

## 17. Constants Cheat Sheet

| Constant | Value | File |
|---|---|---|
| `TILE_SIZE` | 10 | `src/world/terrain.ts:2` |
| `CHUNK_SIZE` | 60 | `src/world/terrain.ts:1` |
| `BUSTED_TIME_THRESHOLD` | 3 s | `src/main.ts:197` |
| `BUSTED_COP_COUNT` | 2 | `src/main.ts:198` |
| `SPEED_STREAK_THRESHOLD` | 5 s | `src/main.ts:199` |
| `SPEED_STREAK_MIN_RATIO` | 0.9 | `src/main.ts:200` |
| `COMBO_DECAY` | 3 s | `src/systems/run-state.ts:25` |
| `MAX_PICKUPS` | 4 | `src/systems/pickup-system.ts:12` |
| `SPAWN_INTERVAL` (pickup) | 6 s | `src/systems/pickup-system.ts:13` |
| `NITRO_DURATION` | 3 s | `src/constants.ts` |
| `NITRO_SPEED_MULT` | 1.55 | `src/constants.ts` |
| `REPAIR_HEAL` | 40 HP | `src/constants.ts` |
| `SCORE_MULT_DURATION` | 8 s | `src/constants.ts` |
| `SCORE_MULT_VALUE` | 2 | `src/constants.ts` |
| `TIME_WARP_DURATION` | 5 s | `src/constants.ts` |
| `TIME_WARP_FACTOR` | 0.5 | `src/constants.ts` |
| `MAGNET_DURATION` | 8 s | `src/constants.ts` |
| `MAGNET_RANGE_MULT` | 3 | `src/constants.ts` |
| `MAGNET_PULL_MULT` | 3 | `src/constants.ts` |
| `GHOST_DURATION` | 3 s | `src/constants.ts` |
| `TANK_DURATION` | 5 s | `src/constants.ts` |
| `TANK_KILL_SCORE` | 25 | `src/constants.ts` |
| `MAX_CIVILIANS` | 8 | `src/systems/civilian-system.ts:10` |
| `CIVILIAN_SPAWN_INTERVAL` | 2 s | `src/systems/civilian-system.ts:11` |
| `STUN_IMPACT_THRESHOLD` | 6 | `src/systems/civilian-system.ts:12` |
| `FLEE_RADIUS` | 8 | `src/systems/civilian-system.ts:13` |
| `FLEE_MIN_PLAYER_SPEED` | 20 | `src/systems/civilian-system.ts:14` |
| `FLEE_FORCE` | 1200 | `src/systems/civilian-system.ts:15` |
| Cop despawn distance | 100 | `src/systems/cop-system.ts:90` |
| Cop damage cooldown | 1 s | `src/systems/cop-system.ts:139` |
| `DEATH_MOMENT_MS` | 700 | `src/main.ts` |
| Particle pool size | 256 | `src/world/effects.ts` |
| `SCORE_MILESTONES` | [1k, 5k, 10k, 25k, 50k, 100k] | `src/constants.ts` |
| `ESCAPE_DIST` | 60 | `src/constants.ts` |
| `ESCAPE_TIME` | 1.5 s | `src/constants.ts` |
| `ESCAPE_REWARD` | +50 score | `src/constants.ts` |
| `ESCAPE_HEAL` | +5 HP | `src/constants.ts` |
| `LOW_HP_THRESHOLD` | 30 | `src/constants.ts` |
| `HEAT_STEP_SCORE` | 1500 | `src/systems/leveling.ts` |
| `HEAT_INTERVAL_SHAVE` | 0.05 s | `src/systems/leveling.ts` |
| `HEAT_INTERVAL_FLOOR` | 0.4 s | `src/systems/leveling.ts` |
| `SWAT_MIN_LEVEL` | 5 | `src/systems/cop-system.ts` |
| `SWAT_RESPAWN_DELAY` | 25 s | `src/systems/cop-system.ts` |
| `SWAT_KILL_SCORE` | 80 | `src/systems/cop-system.ts` |
| `SWAT_KILL_HEAL` | +25 HP | `src/systems/cop-system.ts` |
| Ghost trail pool | 6 | `src/world/ghost-trail.ts` |
| Ghost trail life | 0.4 s | `src/world/ghost-trail.ts` |

---

## 18. Quick Strategy Notes

- **Stay on roads.** Off-road tiles give no points and may be water.
- **Drive at top speed** for the speed multiplier *and* the +5 HP streak.
- **Build combos** by skimming past cops at distance 6–12 — but never
  let them touch you, or the combo (and its multiplier) is gone.
- **Lure cops into rivers.** Each drowned cop is +30 score and +10 HP, and
  contributes to the persistent `copsDrowned` counter that unlocks the
  Corvette C8.
- **Save EMPs for emergencies.** With 12+ cops on screen, an EMP can wipe
  half the screen and heal you for 60+ HP at once.
- **Stack 2X Score with high combos.** A `x12` combo at 2× scores `~13`
  points per tile — by far the highest tile rate in the game. Try to grab
  a 2X right *before* a long road stretch with a few cops to skim.
- **Time Warp ≠ EMP.** Time Warp doesn't kill cops, it just slows them.
  Use it to pile up combo near-misses through a swarm at full speed
  rather than to escape.
- **Ghost is your "oh sh*t" button.** Unlike Shield (one hit) it disables
  the busted check too, so it's the only clean escape from a 4-cop pile-up.
- **Tank flips the game.** For 5 s the cops are the prey — actively chase
  them instead of running. Each ramming kill = +25 score, +10 HP, +1
  drowned. Stack with 2X for double rewards.
- **Magnet → loot run.** Triple range/pull lets you sweep up multiple
  pickups in one drive-by. Grab a Magnet near a cluster.
- **Repair when low.** Below 30 HP, take a Repair on sight even if it's a
  detour — the +40 buys you several more cop hits.
- **When the busted vignette pulses, MOVE.** Even brief sideways drift
  resets the busted timer at 2× the tick rate, so any motion bails you out.
- **Snowy = hardcore mode.** −20% top speed, −25% accel, almost no grip.
  Sunny is the easiest weather; snowy is the hardest.
- **Hunt SWAT for the big payouts.** From level 5 a mini-boss spawns
  every 25 s. Drowning or tank-ramming it is **+80 score / +25 HP** —
  by far the best single cop kill in the game. The ⚠ SWAT popup is your
  cue to start looking for water or pop a Tank.
- **Chase the glow rings.** Cyan-ringed pickups (rare) and gold-ringed
  pickups (epic) are scarcer than commons but disproportionately powerful
  — EMP, Ghost, Tank, 2X Score. Detour to grab them when the ring catches
  your eye in your peripheral vision.
- **Use the heartbeat as a panic cue.** When the low-HP heartbeat starts
  thumping (HP < 30), prioritize a Repair pickup over score-chasing. The
  thump's interval halves as you approach death, so you have an audio
  countdown without needing to glance at the HP bar.
- **Watch the damage edge flash.** A red glow on one side of the screen
  after a hit tells you which direction the cop came from — steer the
  *opposite* way before the 1 s damage cooldown lifts.
- **Disengage on long roads.** The escape reward (+50 score, +5 HP) only
  fires after a chase, not at run start. After a tense weave through cops
  on a downtown grid, peel off into a long suburb road for 1.5 s of
  empty radius and you'll get a free heal *and* the road-tile points.
- **Score milestones are just dopamine.** They don't grant resources, but
  the popup + flash + sting feels like a checkpoint. Use them as
  motivation to push through plateaus.
- **Heat past LV10.** Cop spawn cadence keeps shaving every +1500 score
  past 5500. Endgame survivor runs feel relentless on purpose — Time
  Warp and Ghost become essential, not optional.
- **Combo lifeline = ride the red.** When the combo HUD chip turns red
  and starts ticking, you're seconds from losing the chain. The smartest
  play is to find any cop within 12 units and threaten a near-miss to
  reset the decay timer — even at the risk of a hit. A 12+ chain is
  worth several hits' damage in tile multiplier alone.
