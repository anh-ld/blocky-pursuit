import { screen, gameState } from "../state";

export function Feedback() {
  const back = () => {
    screen.value = gameState.value === "start" ? "howToPlay" : "none";
  };

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center">
      <div class="bg-black/80 border border-violet-500/40 p-5 w-64 pointer-events-auto">
        <div class="text-violet-400 text-xs font-extrabold uppercase tracking-widest mb-3 text-center">
          Feedback
        </div>
        <form name="feedback" method="POST" action="/" data-netlify="true" class="flex flex-col gap-2">
          <input type="hidden" name="form-name" value="feedback" />
          <textarea
            name="message"
            required
            placeholder="What do you think? Bugs, ideas, anything..."
            class="w-full h-24 bg-gray-800 border border-gray-600 text-gray-200 text-xs p-2 resize-none focus:outline-none focus:border-violet-500"
          />
          <button
            type="submit"
            class="w-full py-1.5 bg-violet-500/30 text-violet-300 text-xs font-bold uppercase tracking-wider border border-violet-500/40 cursor-pointer hover:bg-violet-500/40 transition-colors"
          >
            Send
          </button>
        </form>
        <button
          onClick={back}
          class="btn mt-3 bg-gray-700 text-gray-300 text-xs py-2 hover:bg-gray-600 hover:translate-y-0.5 active:translate-y-1"
        >
          BACK
        </button>
      </div>
    </div>
  );
}
