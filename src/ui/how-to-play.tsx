import { screen, canInstallPwa, actions, bestScore, totalRuns, copsDrowned } from "../state";
import { CAR_SKINS, isUnlocked } from "../entities/car-skins";
import { fetchLeaderboard } from "../api";
import { IconSteer, IconCar, IconCop, IconWater, IconBolt, IconSkull, IconStar, IconTrophy, IconDownload } from "./icons";

/* Two columns on desktop: rules left, CTAs right. Single column on mobile — CTAs pinned to bottom. */
export function HowToPlay() {
  const openLeaderboard = () => {
    fetchLeaderboard();
    screen.value = "leaderboard";
  };
  const openFeedback = () => {
    screen.value = "feedback";
  };
  const openGarage = () => {
    screen.value = "garage";
  };

  const progress = {
    best: bestScore.value,
    totalRuns: totalRuns.value,
    copsDrowned: copsDrowned.value,
    selectedSkin: "",
  };
  const unlockedCount = CAR_SKINS.filter((s) => isUnlocked(s, progress)).length;
  const showCareer = totalRuns.value > 0;

  return (
    <div class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div class="w-full h-full md:h-auto md:max-h-[90vh] md:w-[640px] md:max-w-[92vw] bg-[var(--bg-1)] md:p-6 flex flex-col md:flex-row pointer-events-auto">
        {/* Left — title + rules */}
        <div class="flex-1 px-5 pt-6 pb-4 md:p-0 md:pr-6 flex flex-col gap-4 min-w-0">
          <div class="flex flex-col gap-1">
            <h1
              class="font-pixel text-[var(--amber)] text-sm sm:text-base leading-tight"
              style={{ textShadow: "3px 3px 0 #000" }}
            >
              BLOCKY
              <br />
              PURSUIT
            </h1>
            <p class="font-mono-ui text-[var(--text-dim)] text-xs leading-relaxed">
              Evade cops in a blocky city. Don't get busted.
            </p>
          </div>

          <div class="flex flex-col gap-2.5">
            <Row icon={<IconSteer size={16} />} label="Steer left / right" kbd={["A", "D"]} />
            <Row icon={<IconCar size={16} />} label="Car drives itself" />
            <Row icon={<IconCop size={16} />} label="Evade cops" />
            <Row icon={<IconWater size={16} />} label="Lure cops into water" />
            <Row icon={<IconBolt size={16} />} label="Stick to the roads" />
            <Row icon={<IconSkull size={16} />} label="Skim for combo ×3 score" />
          </div>

          {showCareer && (
            <div class="mt-2 pt-3 border-t-2 border-dashed border-[var(--line)]">
              <div class="font-mono-ui text-[9px] text-[var(--text-mute)] uppercase tracking-widest mb-2">
                Career
              </div>
              <div class="grid grid-cols-4 gap-1">
                <Stat label="Best" value={bestScore.value.toLocaleString()} tint="var(--amber)" />
                <Stat label="Runs" value={String(totalRuns.value)} />
                <Stat label="Drowned" value={String(copsDrowned.value)} tint="var(--cyan)" />
                <Stat
                  label="Cars"
                  value={`${unlockedCount}/${CAR_SKINS.length}`}
                  tint="var(--pink)"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right — CTAs. Single column of chunky arcade buttons. */}
        <div class="md:w-56 flex md:flex-col gap-2 px-5 pb-6 md:p-0 md:border-l-2 md:border-[var(--line)] md:pl-6">
          <button onClick={() => actions.startGame()} class="arcade-btn w-full">
            Start
          </button>
          <button onClick={openGarage} class="arcade-btn arcade-btn-ghost w-full">
            Garage
          </button>
          <button onClick={openLeaderboard} class="arcade-btn arcade-btn-ghost w-full">
            <IconTrophy size={14} />
            Leaderboard
          </button>
          <button onClick={openFeedback} class="arcade-btn arcade-btn-ghost w-full">
            Feedback
          </button>
          {canInstallPwa.value && (
            <button onClick={() => actions.installPwa()} class="arcade-btn arcade-btn-cyan w-full">
              <IconDownload size={14} />
              Install
            </button>
          )}
          <a
            href="https://github.com/anh-ld/blocky-pursuit"
            target="_blank"
            rel="noopener"
            class="mt-auto font-mono-ui text-[10px] text-[var(--text-mute)] hover:text-[var(--amber)] transition-colors text-center py-2"
          >
            <IconStar size={10} class="inline-block align-[-1px] mr-1" />
            Star on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  kbd,
}: {
  icon: preact.ComponentChildren;
  label: string;
  kbd?: [string, string];
}) {
  return (
    <div class="flex items-center gap-3 min-w-0">
      <span class="text-[var(--text-dim)] shrink-0 w-4 h-4 flex items-center justify-center">{icon}</span>
      <span class="font-mono-ui text-xs text-[var(--text)] truncate">{label}</span>
      {kbd && (
        <span class="ml-auto flex gap-1 shrink-0">
          {kbd.map((k) => (
            <kbd
              class="font-pixel text-[8px] leading-none text-[var(--text)] bg-[var(--bg-3)] border border-[var(--line-2)] px-1.5 py-1 min-w-5 text-center"
            >
              {k}
            </kbd>
          ))}
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div class="flex flex-col items-start">
      <span class="font-mono-ui text-[8px] text-[var(--text-mute)] uppercase tracking-widest leading-none mb-1">
        {label}
      </span>
      <span
        class={`font-mono-ui text-[11px] font-bold tabular-nums leading-none ${tint ? "" : "text-[var(--text)]"}`}
        style={tint ? { color: tint } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
