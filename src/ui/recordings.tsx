import { gameState, leaderboardEntries, leaderboardLoading, playerName, screen } from "../state";
import { replayUrl } from "./replay-modal";
import { IconPlay, IconStar } from "./icons";

export function Recordings() {
  const back = () => {
    screen.value = gameState.value === "start" ? "howToPlay" : "none";
  };

  const playRecording = (url: string) => {
    replayUrl.value = url;
  };

  const entries = leaderboardEntries.value.filter((e) => !!e.recordingUrl).slice(0, 50);
  const me = playerName.value;

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div class="w-full h-full md:h-auto md:max-h-[90vh] md:w-[480px] md:max-w-[92vw] bg-[var(--bg-1)] pointer-events-auto flex flex-col">
        <div class="px-5 pt-5 pb-2 border-b-2 border-[var(--line)]">
          <h2 class="font-pixel text-[var(--cyan)] text-xs leading-none" style={{ textShadow: "2px 2px 0 #000" }}>
            RECORDINGS
          </h2>
          <p class="font-mono-ui text-[10px] text-[var(--text-mute)] mt-1.5">
            Top runs with replays — watch the run that beat you.
          </p>
        </div>

        <div class="flex-1 overflow-y-auto p-3 min-h-40">
          {leaderboardLoading.value ? (
            <div class="font-mono-ui text-[10px] text-[var(--text-mute)] text-center py-8">Loading…</div>
          ) : entries.length === 0 ? (
            <div class="font-mono-ui text-xs text-[var(--text-mute)] text-center py-8">No recordings yet.</div>
          ) : (
            <div class="flex flex-col">
              {entries.map((e, i) => {
                const isMe = e.name === me;

                return (
                  <div
                    key={`${e.name}-${i}`}
                    class={`flex items-center gap-2 px-2 py-2 ${i > 0 ? "border-t border-[var(--line)]" : ""} ${
                      isMe ? "bg-[var(--bg-3)]" : ""
                    }`}
                  >
                    <span
                      class={`font-pixel text-[10px] tabular-nums w-6 shrink-0 ${
                        isMe ? "text-[var(--amber)]" : "text-[var(--cyan)]"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      class={`font-mono-ui text-xs font-bold truncate flex-1 ${
                        isMe ? "text-[var(--amber)]" : "text-[var(--text)]"
                      }`}
                    >
                      {isMe && <IconStar size={9} class="inline-block align-[-1px] mr-1" />}
                      {e.name}
                    </span>
                    <span
                      class={`font-mono-ui text-xs font-bold tabular-nums ${
                        isMe ? "text-[var(--amber)]" : "text-[var(--text)]"
                      }`}
                    >
                      {e.score.toLocaleString()}
                    </span>
                    <button
                      onClick={() => playRecording(e.recordingUrl!)}
                      class="w-7 h-7 flex items-center justify-center text-[var(--cyan)] hover:text-[var(--text)] border-2 border-[var(--line)] hover:border-[var(--cyan)] cursor-pointer transition-colors"
                      title="Watch replay"
                      aria-label="Watch replay"
                    >
                      <IconPlay size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div class="border-t-2 border-[var(--line)] p-4">
          <button onClick={back} class="arcade-btn arcade-btn-ghost w-full">
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
