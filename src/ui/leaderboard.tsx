import { screen, leaderboardEntries, leaderboardLoading, playerName, gameState } from "../state";

const MEDAL = ["text-amber-400", "text-gray-300", "text-amber-600"];

export function Leaderboard() {
  const back = () => {
    screen.value = gameState.value === "start" ? "howToPlay" : "none";
  };

  const entries = leaderboardEntries.value;
  const me = playerName.value;

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center">
      <div class="bg-black/60 md:bg-black p-5 w-full h-full md:w-64 md:h-auto md:max-h-[90vh] overflow-y-auto pointer-events-auto flex flex-col">
        <div class="text-amber-400 text-xs font-extrabold uppercase tracking-widest mb-3 text-center">
          Leaderboard
        </div>
        <div class="flex flex-col gap-1 text-xs font-semibold min-h-40">
          {leaderboardLoading.value ? (
            <div class="text-gray-500 text-center text-[10px]">Loading...</div>
          ) : entries.length === 0 ? (
            <div class="text-gray-500 text-center text-xs py-6">
              No scores yet. Be the first!
            </div>
          ) : (
            entries.slice(0, 10).map((e, i) => {
              const display = e.name.length > 12 ? e.name.slice(0, 12) + "\u2026" : e.name;
              const isMe = e.name === me;
              const medal = MEDAL[i] ?? "text-gray-500";
              return (
                <div class={`flex justify-between ${isMe ? "text-amber-300" : "text-gray-400"}`}>
                  <span>
                    <span class={medal}>{i + 1}.</span> {display}
                  </span>
                  <span class="tabular-nums">{e.score.toLocaleString()}</span>
                </div>
              );
            })
          )}
        </div>
        <div class="my-3 pt-2 border-t border-gray-700">
          <div class="text-gray-400 text-[10px] text-center">
            You: <span class="text-amber-300">{me}</span>
          </div>
        </div>
        <div class="mt-auto">
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
