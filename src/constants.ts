// Centralized gameplay tuning. Anything a designer would want to tweak to
// re-balance the game lives here. Pure formula coefficients (e.g. damage
// scaling) and geometry constants (e.g. mesh-relative offsets) stay inline
// at the call site since they're tied to the math, not the design.

// --- HP ---
export const MAX_HP = 100;
export const HP_REGEN_PER_SEC = 1;
export const HP_REGEN_SAFE_DIST = 30; // no cop within this radius → passive regen
export const HP_HEAL_ON_LEVEL_UP = 15;
export const HP_HEAL_SPEED_STREAK = 5;
export const HP_HEAL_DROWNED_COP = 10;
export const HP_HEAL_EMP_KILL = 10;

// --- Busted condition (player stopped + surrounded) ---
export const BUSTED_TIME_THRESHOLD = 3;
export const BUSTED_COP_COUNT = 2;
export const BUSTED_NEARBY_RADIUS = 8;
export const BUSTED_STOPPED_SPEED = 2;

// --- Speed streak heal (reward for sustained top-speed driving) ---
export const SPEED_STREAK_THRESHOLD = 5; // seconds at high speed → +HP
export const SPEED_STREAK_MIN_RATIO = 0.9; // fraction of maxSpeed required

// --- Cops ---
export const COP_DESPAWN_DIST = 100;
export const COP_COLLISION_RADIUS = 5;
export const COP_DAMAGE_COOLDOWN = 1.0;
export const COP_MIN_IMPACT_SPEED = 3;
export const COP_HIT_PAUSE = 0.05;
export const SIREN_MAX_RANGE = 40;

// --- Combos (near-miss scoring) ---
export const COMBO_ARM_DIST = 18; // cop must travel beyond this to "arm"
export const COMBO_ENTER_DIST = 12; // re-entering this band counts the combo
export const COMBO_MIN_DIST = 6; // closer than this is a hit, not a near-miss
export const COMBO_MILESTONE = 5; // popup + sound every N combos
export const COMBO_BIG_MILESTONE = 10; // time-slow + flash every N combos
export const COMBO_INSTANT_REWARD_PER_COUNT = 2; // points per combo on near-miss
export const COMBO_MULT_PER_COUNT = 0.1;
export const COMBO_MULT_MAX = 3;

// --- Score awards ---
export const SCORE_BASE_TILE = 1.5;
export const SCORE_DROWNED_COP = 30;
export const SCORE_EMP_KILL = 30;

// --- Death moment (gap between fail trigger and game-over panel) ---
export const DEATH_MOMENT_MS = 700;

// --- Pickups ---
export const PICKUP_MAX = 4;
export const PICKUP_SPAWN_INTERVAL = 6;
export const PICKUP_DESPAWN_DIST = 80;
export const PICKUP_MAX_AGE = 25;
export const PICKUP_COLLECT_DIST = 3.5;
export const PICKUP_MAGNET_RANGE = 6;
export const PICKUP_MAGNET_PULL = 4; // units/sec toward player
// Spawn band: pickup drops between MIN..(MIN+RANGE) units from the player
export const PICKUP_SPAWN_DIST_MIN = 25;
export const PICKUP_SPAWN_DIST_RANGE = 20;

// --- Cop spawning ---
// Spawn band: cops appear between MIN..(MIN+RANGE) units from the player,
// outside camera view but close enough to engage within a few seconds
export const COP_SPAWN_DIST_MIN = 40;
export const COP_SPAWN_DIST_RANGE = 20;
export const NITRO_DURATION = 3;
export const NITRO_SPEED_MULT = 1.55;
// EMP kill range and visual ring are tuned independently — keep them
// separate so a designer can grow the visual feedback without buffing the
// gameplay AOE (or vice versa). They start equal by coincidence, not design.
export const EMP_KILL_RADIUS = 30;
export const EMP_RING_RADIUS = 30;
