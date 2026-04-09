# Blocky Pursuit — Improvement Ideas

A running list of ideas raised during the 2026-04-09 brainstorming session.
46 ideas total, classified by category, effort, impact, and which "shape" of
game they push the project toward.

## Shape Legend

The ideas fall into three (sometimes overlapping) visions for what the game
could become:

- **Shape A — The Endless Arcade Polished.** A better version of what's
  already there. Polish, retention loops, perks, daily challenges. Safe bet.
- **Shape B — The Heist with Stakes.** Every run is a story. Permadeath,
  consequences, passengers, win conditions, court trials. Bold bet.
- **Shape C — The Strange One.** A game nobody else could make. Real
  geography, ghosts of real players, audio-only cops, music reacting to
  driving. Legacy bet.

## Category Legend

- **Polish/UX** — small UX wins, won't move the needle alone
- **Retention/Growth** — bring players back, no gameplay change
- **Tech/Foundation** — enable other ideas
- **Content** — small additive content
- **Progression** — meta-layer between runs
- **Core Loop** — changes how the game _plays_
- **Identity** — changes what the game _is_
- **✅ Done** — already shipped in the current build

---

## Master Table

| #   | Idea                               | Category        | Effort | Impact    | Shape |
| --- | ---------------------------------- | --------------- | ------ | --------- | ----- |
| 1   | Daily Challenge                    | Retention       | M      | High      | A     |
| 2   | Weekly rotating modifier           | Retention       | S      | Med       | A     |
| 3   | Cop bounties                       | Content         | S      | Med       | A     |
| 4   | ✅ Run summary share card          | Growth          | S      | Med       | A     |
| 5   | Garage progression stars           | Progression     | M      | Med       | A     |
| 6   | Combo timer ring                   | Polish/UX       | S      | Low       | A     |
| 7   | Threat compass                     | Polish/UX       | S      | Med       | A     |
| 8   | Pickup preview chip                | Polish/UX       | S      | Low       | A     |
| 9   | Death replay (3-sec slow-mo)       | Polish/Feel     | M      | Med       | A     |
| 10  | Weather forecast preview           | Polish/UX       | S      | Low       | A     |
| 11  | Run replay / ghost system          | Tech/Retention  | L      | High      | A, C  |
| 12  | Web Worker for cop AI              | Tech/Perf       | M      | Low       | A     |
| 13  | Deterministic seed mode            | Tech/Foundation | S      | Low       | A     |
| 14  | Object pooling audit               | Tech/Perf       | S      | Low       | A     |
| 15  | ✅ PWA / installable               | Tech/Growth     | S      | Low       | A     |
| 16  | Manual ability button              | Core Loop       | M      | High      | A, B  |
| 17  | Mid-run perk cards                 | Core Loop       | M      | High      | A     |
| 18  | Zones with mechanical identity     | Core Loop       | M      | High      | A, B  |
| 19  | Cops as resource (heat shards)     | Core Loop       | L      | High      | A, B  |
| 20  | Persistent meta-progression tree   | Progression     | M      | High      | A     |
| 21  | Nemesis cops                       | Identity        | M      | Very High | B, C  |
| 22  | The river is the game              | Identity        | L      | Very High | B, C  |
| 23  | The city remembers                 | Identity        | M      | High      | C     |
| 24  | The driver is a character          | Identity        | S      | High      | C     |
| 25  | ✅ Cop radio chatter               | Identity        | S      | Med-High  | C     |
| 26  | Honk button                        | Core Loop       | S      | Med       | A     |
| 27  | One rewind rule                    | Core Loop       | M      | Very High | B     |
| 28  | Cop corpses are obstacles          | Identity        | S      | High      | B, C  |
| 29  | Real-time-of-day sync              | Identity        | S      | Med-High  | C     |
| 30  | Civilian witnesses multiplier      | Core Loop       | M      | High      | B     |
| 31  | Dispatcher gives side jobs         | Core Loop       | M      | High      | B     |
| 32  | Damaged cops drive damaged         | Core Loop       | M      | Med-High  | A, B  |
| 33  | Asymmetric local 2-player          | Identity        | L      | Very High | C     |
| 34  | Your wreck becomes next run's cop  | Identity        | M      | High      | B, C  |
| 35  | Earned no-HUD mode                 | Identity        | S      | Med       | C     |
| 36  | A passenger you protect            | Core Loop       | M      | Very High | B     |
| 37  | Music reacts to driving            | Identity        | M      | High      | C     |
| 38  | One life across ALL runs           | Progression     | S      | Very High | B     |
| 39  | Audio-only cops                    | Core Loop       | M      | High      | C     |
| 40  | Real geography (OpenStreetMap)     | Identity        | M      | Very High | C     |
| 41  | Build-a-car loadout                | Progression     | M      | High      | A     |
| 42  | The precinct has a budget          | Identity        | M      | High      | B     |
| 43  | Civilians are real players' ghosts | Identity        | M      | High      | C     |
| 44  | Truce mechanic                     | Core Loop       | S      | Med-High  | B, C  |
| 45  | Game-over is a court trial         | Identity        | M      | High      | B, C  |
| 46  | Blacklight minimap                 | Identity        | S      | Med-High  | C     |

---

## Detailed Ideas

### Shape A — The Endless Arcade Polished

#### 1. Daily Challenge

**What:** A single fixed seed/modifier per day with its own leaderboard
("rain only," "no shield pickups," "double cops"). Same daily for everyone.
**Why:** Single biggest retention lever for an endless arcade game — gives
lapsed players a reason to return _today_.
**How:** Requires deterministic seed (idea 13). Modifier = JSON config.

#### 2. Weekly rotating modifier

**What:** One of ~5 mutators rotates every Monday: low gravity, magnet always
on, half HP / double score, etc.
**Why:** Lightweight content treadmill without new assets.
**How:** Server-side flag or hardcoded `weekOfYear() % 5`.

#### 3. Cop bounties

**What:** Random "WANTED" cops spawn with a gold marker, worth 5x score if
drowned. Adds mid-run micro-objectives.
**Why:** Breaks up the sameness between milestones; gives players a target.
**How:** Tag cop on spawn, gold material, multiplier on kill payout.

#### 4. ✅ Run summary share card

**What:** Auto-generate a PNG at game-over (skin + score + heat tier + best
combo + cops drowned), one-tap copy/share.
**Why:** Free organic growth. People share scores when sharing is one tap.
**How:** Canvas API, no extra assets.

#### 5. Garage progression stars

**What:** Each car earns 1–3 stars per achievement (drown 50 cops with it,
hit x20 combo, survive 5 min). 30 micro-goals across the existing 10 cars.
**Why:** You already have 10 cars but most players settle on 1–2. Stars give
every car a reason to exist.
**How:** Per-car counters in localStorage, achievement table in JSON.

#### 6. Combo timer ring

**What:** A thin radial fill around the `xN` chip showing remaining decay
time. Already in the backlog.
**Why:** Players currently can't see when combo will drop until the red
pulse at 25%. Reduces "why did my chain die" frustration.
**How:** Expose `comboTimer` signal, render as SVG/CSS arc.

#### 7. Threat compass

**What:** Edge-of-screen arrow + distance for any cop ramming toward you
from offscreen.
**Why:** Eliminates rear-end deaths you can't see coming. Critical at heat
tier 3+ when 13 cops swarm.
**How:** For each offscreen cop above a velocity threshold, project onto
viewport edge, render arrow.

#### 8. Pickup preview chip

**What:** When a pickup spawns within ~30u, show its icon at the screen edge
pointing toward it.
**Why:** Players currently miss rare pickups behind buildings.
**How:** Same edge-projection as #7, different sprite set.

#### 9. Death replay (3-sec slow-mo)

**What:** On game-over, replay the last 3 seconds in slow-motion from a
chase camera.
**Why:** Turns the worst moment into the most shareable. Compounds with #4.
**How:** Ring buffer of car/cop transforms at 60Hz × 3s, replay with new
camera rig.

#### 10. Weather forecast preview

**What:** In the garage, show a 3-second animated sample of selected weather
on the car.
**Why:** Right now weather choice is abstract; players don't know what
they're picking.
**How:** Mini scene render or canvas thumbnail.

#### 11. Run replay / ghost system

**What:** Record steering inputs + seed; replay your best run as a ghost car
beside you on the next run.
**Why:** Foundational for daily challenges, speedruns, and emotional weight.
"Beat your ghost" is one of the strongest retention loops in racing games.
**How:** Input log + deterministic playback. Requires seed mode (#13).

#### 12. Web Worker for cop AI

**What:** Move flank/predict pathing for 13+ cops into a worker.
**Why:** Stutters on mobile at heat tier 5. Keeps cannon-es on main thread.
**How:** Worker takes player + cop transforms, returns target velocities.

#### 13. Deterministic seed mode

**What:** Route all `Math.random` calls through a seedable PRNG.
**Why:** Foundation for daily challenges, replays, speedruns, ghost system.
Cannot do #1, #11, #41 without this.
**How:** Wrap `Math.random` once, replace with mulberry32 or sfc32.

#### 14. Object pooling audit

**What:** Pool score popups and skid marks via fixed ring buffers.
**Why:** At high combo, popup allocation thrashes GC.
**How:** Pre-allocate N entries, reuse via `active` flag.

#### 15. ✅ PWA / installable

**What:** Service worker + manifest. Installable to home screen, plays
offline after first load.
**Why:** Free retention on mobile. Home-screen icon = repeat play.
**How:** Vite PWA plugin, manifest JSON, basic offline cache strategy.

#### 16. Manual ability button

**What:** One contextual key/tap bound to handbrake-drift OR emergency
boost, with cooldown.
**Why:** The single biggest skill-ceiling change available. Right now the
game is one-input. Adding one expressive verb doubles depth instantly.
**How:** New impulse on cannon body, cooldown UI, tutorial popup.

#### 17. Mid-run perk cards

**What:** Every level-up, instead of just +15 HP, pause and offer 3 perk
cards: "Cops drop 2x HP," "Combos decay 50% slower," "Pickups last 2x as
long but spawn half as often." Pick one, run continues.
**Why:** Turns every run into a _build_. Two runs are never the same. The
proven retention mechanic for every successful arcade game in the last 5
years (Slay the Spire, Vampire Survivors, Brotato).
**How:** Modal at level-up, perks = JSON of stat modifiers, run state holds
active perks.

#### 18. Zones with mechanical identity

**What:** Make Downtown, Suburbs, Nature _play_ differently, not just look
different. Downtown: narrow grid, no off-road, +50% spawn rate. Suburbs:
wide roads, 2x pickups, rare SWAT at low level. Nature: water everywhere,
no roads = no tile points unless you find a highway.
**Why:** Right now zone choice is cosmetic. Make it strategic.
**How:** Zone-specific spawn tables in `terrain.ts` and `spawning.ts`.

#### 19. Cops as resource (heat shards)

**What:** Cops drop "heat shards" when killed. Spend shards at level-up to
bias the perk pool, OR charge a player ability that fires on demand.
**Why:** Cops are currently pure threat. This makes them something you
_want_ to engage with — combat becomes a loop, not just avoidance.
**How:** New pickup type spawned on cop death, shard counter in run state.

#### 20. Persistent meta-progression tree

**What:** Outside of runs, a small upgrade tree spent with a soft currency
earned per run: "+5% starting HP," "Start with 1 random pickup," "Unlock a
4th perk choice."
**Why:** Without meta-progression, your skill ceiling is the game's
lifespan. With it, every run feeds the next.
**How:** Tree data in JSON, persistent unlocks in localStorage.

#### 26. Honk button

**What:** One key. Honk clears civilians off the road in a small radius
(utility) but draws every cop within 80u toward you (cost).
**Why:** Real risk/reward verb in a single button. Canon for a getaway car.
**How:** New input, force impulse on civilians, cop AI bias toward honk.

#### 32. Damaged cops drive damaged

**What:** Knock a wheel off a cop and they limp. Smash their hood and they
smoke + lose top speed. Hit them hard on one side and they roll.
**Why:** Right now cops are HP bars. Make them physical objects with wear.
You can _cripple_ a cop without killing it, then circle back to drown the
limper.
**How:** Per-cop wear flags, conditional physics constraints, material swap
on damage tier.

#### 41. Build-a-car loadout

**What:** Before each run, assemble a car from earned parts: this engine,
those tires, that horn, this paint. Mix-and-match.
**Why:** Opens build variety without 10 hand-crafted skins. Players
experiment instead of just picking the best stat-line.
**How:** Parts table, equipment slots, stat composition logic.

---

### Shape B — The Heist with Stakes

#### 27. One rewind rule

**What:** You die once per run. On death, time rewinds 2 seconds and you
get _one_ chance to re-steer. Die again = run ends.
**Why:** Single-use Braid mechanic. Turns the moment of death into a puzzle.
Shockingly underused in arcade games.
**How:** Ring buffer of player+world state, one-shot rewind flag in run
state.

#### 30. Civilian witnesses = score multiplier

**What:** Civilians are spectators with phones. The more civilians within
~30u line of sight when you do something cool (drift, near-miss, drown a
cop), the higher your _viral multiplier_ climbs. Empty streets = no score
even on great driving.
**Why:** The crowd is the scoreboard. Makes Downtown matter mechanically.
Gives a reason to drive _toward_ civilians, not avoid them.
**How:** Per-civilian visibility check, cumulative multiplier in run state.

#### 31. Dispatcher gives mid-run side jobs

**What:** Every ~45s a radio dispatcher pings you with a side objective:
"Pick up a package at the docks — 20 seconds." "Lose the tail in the alleys
for 10s straight." "Drown an officer at the bridge." Complete = bonus +
cosmetic + heat drop. Ignore = nothing happens.
**Why:** Optional micro-quests inside an endless run. You're not just
surviving anymore — you're choosing how greedy to be.
**How:** Job queue, world-anchor markers, completion tracking.

#### 36. A passenger you have to protect

**What:** A kid (or wounded partner, or bomb, or stolen art) in the back
seat. Hard turns, crashes, near-misses raise their fear meter. Fear full =
scream → combo reset. Calm + clean escapes = +score multiplier.
**Why:** Flips your entire risk/reward calculus _without_ changing physics.
Right now near-misses are pure upside; with a passenger they're a moral
choice. Crazy Taxi had this; nobody since has used it well.
**How:** Fear state machine (impacts, near-miss proximity, hard steer),
HUD meter, audio ducking on scream.

#### 38. One life across ALL runs

**What:** You have _one life_, ever, until you die. Then the entire save
resets — cars, score, nemesis cops, everything.
**Why:** Death is currently meaningless because retry is one click. With
one real life, your 47-minute run becomes a story you tell people. Every
near-miss matters. Soft version: one life per real-world day.
**How:** Wipe localStorage on death (with extreme confirmation UX). Or
gate all unlocks behind a "live save" flag.

#### 42. The precinct has a budget

**What:** Cops aren't infinite. Each has a deployment cost ($50k cruiser,
$300k SWAT, $500k helicopter). The precinct starts the run with $2M.
Drowning a cop _destroys_ their asset — they can't redeploy it. **You win
when you bankrupt them.**
**Why:** A real win condition. Endless mode dies because there's no
destination. Now there is. Every kill has economic weight. The story sells
itself: small-time getaway driver vs. an entire department's annual budget.
**How:** Budget counter in run state, cost table per cop type, win-state
modal on bankruptcy.

---

### Shape C — The Strange One

#### 23. The city remembers

**What:** The procedural city _persists_. Every cop you drowned last run
still floats in the river. Every building you crashed into still has a
hole. Skid marks, wreckage, debris — all stay across runs. After 20 runs
your city looks like a war zone, and that visual _is_ your scoreboard.
**Why:** Death Stranding-tier emotional weight at tiny tech cost. Bonus:
"tour mode" with no cops where you drive through your past carnage.
**How:** Persist scarred chunk diffs to localStorage, replay on chunk load.

#### 24. The driver is a character

**What:** The car drives itself — make the AI driver a _person_. Name,
face in HUD corner, reactions ("WATER WATER WATER" when you steer toward a
river, taunts when you escape). Trust meter: too many wall-crashes and the
driver starts overriding your steering, costing combos.
**Why:** Reframes the entire game from "I'm a bad driver" to "I'm riding
shotgun with someone who is mad at me." A _feeling_ no other arcade game
has. Almost zero new physics.
**How:** Portrait sprite, state machine for driver mood, override hook
into steering input.

#### 25. ✅ Cop radio chatter

**What:** Procedural voice/text bubbles in HUD as cops coordinate:
"Suspect headed for the river — cut him off on 5th!" "We lost visual."
"Officer down." Generated from actual game state.
**Why:** Free worldbuilding from data you already have. Turns silent bots
into a hunting pack.
**How:** Event-driven template strings keyed off game events.

#### 29. Real-time-of-day sync

**What:** Game time = your local time. Playing at 11pm = night map,
headlights, fewer civilians. Playing at 8am = rush hour, golden light,
civilians everywhere. The game is _literally different_ depending on when
you sit down.
**Why:** Almost no other game does this. Costs ~2 hours of work for an
identity-defining feature.
**How:** Read `new Date()`, map hour to lighting/spawn presets.

#### 33. Asymmetric local 2-player

**What:** Couch co-op. P1 plays the normal game. P2 spawns cops on a
top-down minimap by tapping locations. **The cops aren't AI when there's
a second player — they're the second player's hand.**
**Why:** The DM mode of a chase game. Massive meme/streaming potential.
**How:** Second view (split screen or second window), cop spawn API
reachable from a UI canvas.

#### 35. Earned no-HUD mode

**What:** Once you've played 50 runs, unlock a clean mode with no UI. Audio

- visuals only carry the game. Forces you to read the world.
  **Why:** Subtraction as reward. Mastery is recognized by _removing_ the
  training wheels, not adding more chrome.
  **How:** Hide HUD elements behind a single flag, unlock on milestone.

#### 37. Music reacts to driving

**What:** The radio plays tracks (real or proc-gen) and they _react_ to
you. Drum hits on near-misses. Bass drops on level-up. Filter sweeps with
speed. _Your driving makes the music._
**Why:** Rhythm game in disguise. Audio is currently sound-effects only;
this turns the score into a co-author.
**How:** Web Audio API, schedule beats against game events, layer stems.

#### 39. Audio-only cops

**What:** No HUD radar, no offscreen visual indicators. You hear cops by
stereo siren positioning. The river isn't just where you drown them — it's
where you escape to silence them.
**Why:** Sensory subtraction. Forces players into a different kind of
attention. Compounds with #35.
**How:** PannerNode per cop, distance-based volume, kill all visual
offscreen indicators.

#### 40. Real geography from OpenStreetMap

**What:** Pull a real city's road network from OSM. Default to player's
location (with permission), or let them type a city. You're now drowning
cops in _the actual river_ through your hometown.
**Why:** Every player's game is unique without authoring a single map.
People will play it just to drive through their neighborhood, then again
through a friend's. Free content, free virality, free emotional weight.
**How:** OSM Overpass API, parse road polylines, feed into existing voxel
generator as a constraint instead of noise.

#### 43. Civilians are real players' ghosts

**What:** Every wandering civilian is a lightweight recreation of a real
player's run. Their car model is the one that player drove. Their name
floats above. Brushing past = brushing past someone else's history.
**Why:** The world feels populated by _people_. You'll recognize friends'
cars. Async multiplayer with zero servers — just a flat JSON of car +
path + name.
**How:** Upload run trace on opt-in, fetch a small pool of traces on game
start, replay them as civilian sprites.

#### 46. Blacklight minimap

**What:** You only see roads you've already driven. Every run starts with
a near-blank map and you "discover" the city as you drive. Map persists
across runs. The city _reveals itself_ over your career.
**Why:** Turns navigation into a long-term progression. After 100 runs you
have a map worth looking at — built by your own tires.
**How:** Bitmap of explored tiles in localStorage, render as overlay.

---

### Shape Overlap — Multi-Shape Ideas

#### 21. Nemesis cops [Shape B + C]

**What:** Each cop you fail to kill gains a name, face color, and stat. If
you drown them, they're gone forever. If they bust you or escape, they
come back stronger next run with a grudge: _"Officer Reeves — 3 chases
survived, 1 partner drowned. He's faster now."_ Killing a nemesis pays out
massively and unlocks something cosmetic.
**Why:** You already have 5 cop tiers, persistent storage, popups over
heads, and SWAT mini-bosses. The infrastructure is already there. The
nemesis system is the most-loved mechanic in Shadow of Mordor and nobody
has done it for an endless arcade game. This is the _thing people would
post about_.
**How:** Persist named cop entries to localStorage with stats and history,
spawn nemeses preferentially over generic cops.

#### 22. The river is the game [Shape B + C]

**What:** Re-center the entire game on drowning. Score isn't from driving
— score _is_ cops drowned. Roads exist only to lure. Add bridges you can
collapse (one-shot), levees that flood roads when broken, drawbridges on
timers. The map becomes a Rube Goldberg machine for drowning cops.
**Why:** You have the most original kill verb in the genre and it's
currently a footnote. Lean fully into the one thing that makes your game
not-like-the-other-arcade-games.
**How:** Replace tile scoring with kill scoring, add destructible water
gates / collapsible bridges as new world primitives.

#### 28. Cop corpses are obstacles [Shape B + C]

**What:** Drowned cops don't despawn from the river. They float. Other
cops trying to enter the water have to maneuver around them, eventually
getting stuck. Inside a single run, you're literally _building a corpse
dam_ that funnels chasers.
**Why:** Emergent gameplay from removing one line of code (the despawn).
You become the architect of their drowning.
**How:** Don't despawn drowned cops — leave them as kinematic floating
obstacles in cop pathfinding.

#### 34. Your wreck becomes next run's cop [Shape B + C]

**What:** When you die, the path your car drove this run becomes the
patrol route of a _ghost cop_ in your next run. Drive carelessly = give
yourself a worse cop tomorrow. Drive well = your past self chases you
smart.
**Why:** Every run is haunted by its predecessor. Nemesis cops, but the
nemesis is _you_. Compounds with #21.
**How:** Save last run's input log (idea 13/11 again), replay as a cop AI.

#### 44. Truce mechanic [Shape B + C]

**What:** If you near-miss the same cop 3 times _without_ killing them,
they "respect" you and stop chasing for the rest of the run. You can build
a truce. Anti-violence playstyle option.
**Why:** Adds a pacifist path. Right now there's no choice in how you play
— you fight or die. This opens a third lane.
**How:** Per-cop near-miss counter, "respect" state in cop AI.

#### 45. Game-over is a court trial [Shape B + C]

**What:** You don't die — you get _arrested_. The end-of-run screen is a
courtroom. A judge tallies your charges (cops killed: 12, civilians
terrorized: 47, property damage: $1.2M) and sentences you to N years. Your
sentence becomes your _next run's_ starting handicap: "5 years = start
with 5 active cops, no pickups for 30s, 2x heat."
**Why:** Transforms death from "click retry" into a narrative beat.
Carries consequences forward without forcing permadeath. Rewards restraint
without forcing it. Funny. Quotable. Gives the game a _voice_.
**How:** Counters during run, modal at game-over, handicap state passed
into next run.

---

## Quick Picks (if forced)

- **Highest impact / lowest cost:** 21 (Nemesis cops), 28 (Floating cop
  corpses), 38 (One life), 24 (Driver as character)
- **Highest impact / high cost:** 22 (River-centric redesign), 33 (Local
  2-player DM), 40 (Real geography), 36 (Passenger to protect)
- **The "make this game legendary" pick:** 21 + 22 + 42 + 45 — nemesis cops
  who chase you while you try to bankrupt the precinct by drowning their
  fleet, and every death is a court trial that hands you a worse start.
