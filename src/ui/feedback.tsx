import { screen, gameState } from "../state";

export function Feedback() {
  const back = () => {
    screen.value = gameState.value === "start" ? "howToPlay" : "none";
  };

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center">
      <div class="bg-black/60 md:bg-black p-5 w-full h-full md:w-64 md:h-auto md:max-h-[90vh] overflow-y-auto pointer-events-auto flex flex-col">
        <div class="text-violet-400 text-xs font-extrabold uppercase tracking-widest mb-3 text-center">
          Feedback
        </div>
        <form name="feedback" method="POST" action="/" data-netlify="true" class="flex flex-col gap-2 mb-2">
          <input type="hidden" name="form-name" value="feedback" />
          <textarea
            name="message"
            required
            placeholder="What do you think? Bugs, ideas, anything..."
            class="w-full h-24 bg-gray-800 border border-gray-600 text-gray-200 text-xs p-2 resize-none focus:outline-none focus:border-violet-500"
          />
          <button
            type="submit"
            class="w-full py-2 bg-violet-500/30 text-violet-300 text-xs font-bold uppercase tracking-wider border border-violet-500/40 cursor-pointer hover:bg-violet-500/40 transition-colors"
          >
            Send
          </button>
        </form>
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
