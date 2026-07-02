# Conductor Deepening — Plan

## Context

`src/main.ts` is the per-frame **conductor**: 864 LOC, 26 imports, owns 12 distinct per-frame jobs (level-up branch, combo lifeline, score milestones, escape reward, low-HP heartbeat, siren on/off, BGM duck, skid emit, speed lines, portal redirect, water check, busted check, plus `run.syncHud()`). Each gameplay event fans out 5+ imperative calls into 5+ sibling effects modules (`effects.ts`, `popups.ts`, `skids.ts`, `sound.ts`, `haptics.ts`, `radio.ts`). Adding a cue ("level 7 also plays a confetti burst") means editing the conductor. The conductor is duplicated effort with the systems: `cop-system.ts` and `pickup-system.ts` also call into the effects modules directly, so the FX fan-out happens in *three* places.

There are zero tests. The conductor is the only path from a gameplay event to its visual/audio response. A regression in any of the 12 per-frame branches breaks the whole loop with no signal except "the game looks wrong."

## Decision

Introduce a typed **event channel** between gameplay logic and presentation. Gameplay systems and the conductor's per-frame branches emit **FrameEvents**. A new module, **`WorldFx`**, is the single consumer: it receives events and fans them out to the existing effects modules. The conductor becomes a thin drain loop.

The two new modules are `src/systems/frame-events.ts` (types only) and `src/world/world-fx.ts` (the dispatcher). No new dependencies. The existing effects modules stay where they are — `WorldFx` is a *facade*, not a rewrite.

## Glossary (inline)

| Term | Definition |
|---|---|
| Conductor | The module that runs the per-frame gameplay loop and dispatches side effects — currently `main.ts` |
| FrameEvent | A typed record describing a single transition in gameplay state (e.g. `copKilled`, `playerDrowned`, `playerLeveledUp`) |
| WorldFx | The facade module that fans a `FrameEvent` out to the underlying effects modules (particles, audio, haptics, popups, radio) |
| LevelUpEvent | A `FrameEvent` subtype emitted when the player's level increments; carries HP heal, popup text, audio cue, chatter key |
| CarDisplaySample | A snapshot of Car state needed by display-only systems: `{ lateralSpeed, rearLeft, rearRight, heading }` |
| Locality | A module earns its rent if all knowledge of "what happens at X" lives in one place |

## Phase 1 — Define the vocabulary (no behavior change)

**Scope.** Add two new files with types and empty-method stubs. Nothing calls them.

**Files.**
- `src/systems/frame-events.ts` (new) — `FrameEvent` discriminated union, one variant per gameplay event.
- `src/world/world-fx.ts` (new) — `WorldFx` interface, one method per event, all empty.

**Behavior change.** None. Stubs only.

**Merge test.** `tsc` and `bun run build` pass. Game plays identically. The new files compile and export; no other file imports them yet.

**Rollback.** Delete the two files. No other diffs.

## Phase 2 — Wire the conductor to drain events

**Scope.** The 12 per-frame branches in `main.ts:_tickPlayingInner` are rewritten: compute state, push events into a `FrameEvent[]`, drain via `worldFx.dispatch(ev)` after the loop. The systems (`cop-system.ts`, `pickup-system.ts`) append events to their return value instead of calling FX directly. `WorldFx` is implemented: each method fans out to the same `spawnSplash`/`playSplash`/etc. the conductor used to call.

**Files.**
- `src/main.ts` (modified) — `_tickPlayingInner` shrinks; the 12 imperative call sites collapse to one drain loop.
- `src/systems/cop-system.ts` (modified) — returns `FrameEvent[]` from `update()`; no longer calls `spawnConfetti`/`playSplash`/`pushChatter`/etc. directly.
- `src/systems/pickup-system.ts` (modified) — same shape.
- `src/world/world-fx.ts` (now implemented) — each method dispatches to the existing effects modules.

**Behavior change.** Yes. `main.ts` drops from ~864 to ~300 LOC. The visible game is identical.

**Merge test.** `bun run build` passes. Manual play: drive forward, hit a cop (confetti + sparks + crash audio), drown a cop (chain popup + splash), level up (HP heal popup + audio + haptic), collect Nitro (whoosh), collect Shield (confetti on next hit), cross a portal (redirect), let a milestone hit (popup + flash), escape (reward popup + audio), drive into water (splash + radio signoff). All identical to pre-refactor.

**Rollback.** Revert the commit. No data migration (game is client-side; leaderboard/replay is unchanged). Netlify deploy is reverted by re-deploying the previous build.

## Deferred (not in this plan)

**Phase 3 — Level consequences own the record.** `leveling.ts:LEVEL_DEFS` becomes richer (`{ maxCops, spawnInterval, scoreThreshold, ai, bountyRate, swatEnabled, onLevelUp }`). `run.advanceLevel()` returns a `LevelUpEvent`. The conductor (via `WorldFx`) dispatches. Trigger to unblock: the next time a level is added, an AI tier changes, or a level-up reward is rebalanced. Cost: ~50 LOC across `leveling.ts`, `entities/cop.ts`, `cop-system.ts`, `main.ts`. Absorbs `COP_LEVEL_CONFIGS` and the `BOUNTY_SPAWN_CHANCE`/`SWAT_MIN_LEVEL` constants in `cop-system.ts`.

**Phase 4 — `car.sampleDisplay()`.** `Car` exposes one method returning `{ lateralSpeed, rearLeft, rearRight, heading }`. The heading math moves out of `main.ts` (currently duplicated at lines 716 and 741 for skids and speed lines). Trigger: any of the four readers (`main.ts:711-720`, `skids.ts`, speed lines, future) starts to need a fifth value. Cost: ~30 LOC.

**Phase 5 — Procedural city: feature vs zone.** Decouple `isRoad`/`isWater`/`isShore` from the zone system. Currently `isWater` short-circuits on `zone === NATURE` (`terrain.ts`), making a downtown lake impossible. **Drop for now** — speculative, no change pressure, the zone split already earns its rent on building style.

## Fragile assumption

All 12 per-frame branches in `main.ts` are expressible as discrete events. **If `sirenIntensity` needs continuous per-frame interpolation** (not just on/off + duck), or **the heartbeat interval** needs to ramp on a per-frame basis (not just transition on/off), then the drain loop is wrong for those — they are signals, not events.

**Deformation if this breaks:** the conductor keeps two sections. (a) **Per-frame signals** — `sirenIntensity` ramp, `heartbeat` interval, anything continuous. (b) **Events** — drown, kill, level-up, milestone, escape. Both real, both small. The plan splits, not monolithic.

## Out of scope

- Test framework (vitest, bun:test). The interface *is* the test surface per `/codebase-design`. Adding tests is a follow-up, not a Phase 0.
- Splitting `sound.ts` into ambient/sfx. The call-site fix is in `WorldFx`; the file stays.
- The `car-physics.ts` / `car-mesh.ts` / `car-skins.ts` splits. Already earn their rent.
- The procedural city feature/zone refactor. No change pressure.
- Any UI changes. `state.ts` signals stay as-is.
- `CONTEXT.md` and an ADR for this decision. Both can come after Phase 2 lands and the code itself documents the seam.

## Cost summary

| Phase | LOC changed | New files | Behavior change | Mergeable alone? |
|---|---|---|---|---|
| 1 | 0 | 2 | None | Yes (type definitions only) |
| 2 | ~600 across 4 files | 0 | Conductor shrinks; visible game identical | Yes |
| 3 (deferred) | ~50 across 4 files | 0 | Level-up data shape changes | Yes |
| 4 (deferred) | ~30 across 2 files | 0 | Heading math relocates | Yes |
| 5 (dropped) | — | — | — | — |

## What this is *not*

Not a rewrite. Not a refactor of the physics, the car, the city, or the UI. Not adding tests. Not adding a framework. Not adding new gameplay. The visible game is byte-identical before and after Phase 2. The diff is structural: types, an interface, and a smaller conductor.
