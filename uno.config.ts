import { defineConfig, presetWind4 } from "unocss";

export default defineConfig({
  presets: [presetWind4()],
  shortcuts: {
    panel:
      "bg-white border-4 border-teal-500 text-center pointer-events-none invisible scale-95 opacity-0 transition-all duration-200 ease-out p-8 max-w-80",
    "panel-visible": "pointer-events-auto visible scale-100 opacity-100",
    btn: "text-base font-extrabold border-none py-3.5 px-6 cursor-pointer uppercase w-full tracking-widest transition-transform duration-100",
    "btn-cta":
      "btn bg-amber-400 text-black hover:translate-y-0.5 active:translate-y-1",
    "btn-danger":
      "btn bg-red-400 text-white hover:translate-y-0.5 active:translate-y-1",
    kbd: "bg-gray-100 w-11 h-11 flex items-center justify-center text-black text-sm font-extrabold",
  },
});
