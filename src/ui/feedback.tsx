import { screen, gameState } from "../state";

export function Feedback() {
  const back = () => {
    screen.value = gameState.value === "start" ? "howToPlay" : "none";
  };

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div class="w-full h-full md:h-auto md:max-h-[90vh] md:w-[480px] md:max-w-[92vw] bg-[var(--bg-1)] pointer-events-auto flex flex-col">
        <div class="px-5 pt-5 pb-3 border-b-2 border-[var(--line)]">
          <h2
            class="font-pixel text-[var(--cyan)] text-xs leading-none"
            style={{ textShadow: "2px 2px 0 #000" }}
          >
            FEEDBACK
          </h2>
          <p class="font-mono-ui text-[10px] text-[var(--text-mute)] mt-1.5">
            Bugs, ideas, anything. One message is enough.
          </p>
        </div>

        <form
          name="feedback"
          method="POST"
          action="/"
          data-netlify="true"
          class="flex-1 p-5 flex flex-col gap-3"
        >
          <input type="hidden" name="form-name" value="feedback" />
          <textarea
            name="message"
            required
            placeholder="What do you think?…"
            class="w-full flex-1 min-h-32 bg-[var(--bg-2)] border-2 border-[var(--line)] focus:border-[var(--cyan)] text-[var(--text)] font-mono-ui text-xs p-3 resize-none outline-none placeholder:text-[var(--text-mute)]"
          />
          <button type="submit" class="arcade-btn arcade-btn-cyan w-full">
            Send
          </button>
        </form>

        <div class="border-t-2 border-[var(--line)] p-4">
          <button onClick={back} class="arcade-btn arcade-btn-ghost w-full">
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
