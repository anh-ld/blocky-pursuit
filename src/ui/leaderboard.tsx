import { screen, leaderboardEntries, leaderboardLoading, playerName, gameState } from "../state";
import { replayUrl } from "./replay-modal";
import { fetchLeaderboard } from "../api";
import { IconPlay, IconTrophy } from "./icons";

const RANK_TINT = ["var(--amber)", "var(--text)", "var(--text-dim)"];

export function Leaderboard() {
  const back = () => {
    screen.value = gameState.value === "start" ? "howToPlay" : "none";
  };
  const playRecording = (url: string) => {
    replayUrl.value = url;
  };
  const openRecordings = () => {
    fetchLeaderboard();
    screen.value = "recordings";
  };

  const entries = leaderboardEntries.value;
  const me = playerName.value;

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div class="w-full h-full md:h-auto md:max-h-[90vh] md:w-[480px] md:max-w-[92vw] bg-[var(--bg-1)] pointer-events-auto flex flex-col">
        <div class="px-5 pt-5 pb-3 border-b-2 border-[var(--line)] flex items-center gap-2">
          <IconTrophy size={18} class="text-[var(--amber)] shrink-0" />
          <h2 class="font-pixel text-[var(--amber)] text-xs leading-none" style={{ textShadow: "2px 2px 0 #000" }}>
            LEADERBOARD
          </h2>
        </div>

        <div class="flex-1 overflow-y-auto p-3 min-h-40">
          {leaderboardLoading.value ? (
            <div class="font-mono-ui text-[10px] text-[var(--text-mute)] text-center py-8">Loading…</div>
          ) : entries.length === 0 ? (
            <div class="font-mono-ui text-xs text-[var(--text-mute)] text-center py-8">
              No scores yet. Be the first.
            </div>
          ) : (
            <div class="flex flex-col">
              {entries.slice(0, 10).map((e, i) => {
                const isMe = e.name === me;
                const tint = RANK_TINT[i] ?? "var(--text-mute)";
                return (
                  <div
                    key={`${e.name}-${i}`}
                    class={`flex items-center gap-2 px-2 py-2 ${i > 0 ? "border-t border-[var(--line)]" : ""} ${
                      isMe ? "bg-[var(--bg-3)]" : ""
                    }`}
                  >
                    <span class="font-pixel text-[10px] tabular-nums w-6 shrink-0" style={{ color: tint }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      class={`font-mono-ui text-xs font-bold truncate flex-1 ${
                        isMe ? "text-[var(--amber)]" : "text-[var(--text)]"
                      }`}
                    >
                      {e.name}
                    </span>
                    <span
                      class={`font-mono-ui text-xs font-bold tabular-nums ${
                        isMe ? "text-[var(--amber)]" : "text-[var(--text)]"
                      }`}
                    >
                      {e.score.toLocaleString()}
                    </span>
                    {e.recordingUrl && (
                      <button
                        onClick={() => playRecording(e.recordingUrl!)}
                        class="w-7 h-7 flex items-center justify-center text-[var(--cyan)] hover:text-[var(--text)] border-2 border-[var(--line)] hover:border-[var(--cyan)] cursor-pointer transition-colors"
                        title="Watch replay"
                        aria-label="Watch replay"
                      >
                        <IconPlay size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div class="px-5 py-2 border-t-2 border-[var(--line)] font-mono-ui text-[10px] text-[var(--text-mute)] uppercase tracking-widest text-center">
          You: <span class="text-[var(--amber)]">{me}</span>
        </div>

        <div class="border-t-2 border-[var(--line)] p-4 flex flex-col gap-2">
          <button onClick={openRecordings} class="arcade-btn arcade-btn-cyan w-full">
            Browse recordings
          </button>
          <button onClick={back} class="arcade-btn arcade-btn-ghost w-full">
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
