import { defineConfig } from "vite";
import UnoCSS from "@unocss/vite";
import { presetWind4 } from "unocss";
import { VitePWA } from "vite-plugin-pwa";
import preact from "@preact/preset-vite";

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  return {
    plugins: [
      preact(),
      UnoCSS({
        presets: [presetWind4()],
        safelist: ["opacity-0", "bg-yellow-400", "bg-red-400"],
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
          "kbd-sm":
            "bg-gray-100/80 w-5 h-5 flex items-center justify-center text-black text-[10px] font-bold leading-none",
        },
      }),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.png"],
        manifest: {
          name: "Blocky Pursuit",
          short_name: "Blocky Pursuit",
          description: "Evade cops in a blocky city — don't get busted!",
          start_url: "/",
          display: "fullscreen",
          orientation: "any",
          background_color: "#000000",
          theme_color: "#111827",
          icons: [
            {
              src: "/icon.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg}"],
        },
      }),
      isProd && {
        name: "inject-vibe-jam",
        transformIndexHtml: () => [
          {
            tag: "script",
            attrs: {
              async: true,
              src: "https://vibej.am/2026/widget.js",
            },
            injectTo: "head",
          },
        ],
      },
    ],
    build: {
      outDir: "dist",
    },
  };
});
