import { gameState, leaderboardEntries, leaderboardLoading, playerName, screen } from "../state";
import { replayUrl } from "./replay-modal";

export function Recordings() {
  const back = () => {
    screen.value = gameState.value === "start" ? "howToPlay" : "none";
  };

  const playRecording = (url: string) => {
    replayUrl.value = url;
  };

  const entries = leaderboardEntries.value
    .filter((e) => !!e.recordingUrl)
    .slice(0, 50);
  const me = playerName.value;

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center">
      <div class="bg-black/60 md:bg-black p-5 w-full h-full md:w-160 md:max-w-[90vw] md:h-auto md:max-h-[90vh] overflow-y-auto pointer-events-auto flex flex-col">
        <div class="text-cyan-400 text-xs font-extrabold uppercase tracking-widest mb-1 text-center">
          Top Recordings
        </div>
        <div class="text-gray-500 text-[10px] text-center mb-3">
          Browse recorded top runs
        </div>

        <div class="flex flex-col gap-1 text-xs font-semibold min-h-40">
          {leaderboardLoading.value ? (
            <div class="text-gray-500 text-center text-[10px]">Loading...</div>
          ) : entries.length === 0 ? (
            <div class="text-gray-500 text-center text-xs py-6">
              No recordings yet.
            </div>
          ) : (
            entries.map((e, i) => {
              const display = e.name.length > 12 ? e.name.slice(0, 12) + "\u2026" : e.name;
              const isMe = e.name === me;
              return (
                <div class={`flex items-center justify-between ${isMe ? "text-amber-300" : "text-gray-400"}`}>
                  <span>
                    <span class="text-cyan-400">{i + 1}.</span> {display}
                  </span>
                  <div class="flex items-center gap-2">
                    <span class="tabular-nums">{e.score.toLocaleString()}</span>
                    <button
                      onClick={() => playRecording(e.recordingUrl!)}
                      class="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded"
                      title="Watch replay"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div class="mt-auto pt-3">
          <button
            onClick={back}
            class="btn bg-gray-700 text-gray-300 text-xs py-2 tracking-wider hover:bg-gray-600"
          >
            BACK
          </button>
        </div>
      </div>
    </div>
  );
}
