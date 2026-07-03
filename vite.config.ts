import { defineConfig } from "vite";
import UnoCSS from "@unocss/vite";
import { presetWind4 } from "unocss";
import { VitePWA } from "vite-plugin-pwa";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [
    preact(),
    UnoCSS({
      presets: [presetWind4()],
      safelist: ["opacity-0"],
      shortcuts: {
        panel:
          "bg-white border-4 border-teal-500 text-center pointer-events-none invisible scale-95 opacity-0 transition-all duration-200 ease-out p-8 max-w-80",
        btn: "text-base font-extrabold border-none py-3.5 px-6 cursor-pointer uppercase w-full tracking-widest transition-transform duration-100",
        kbd: "bg-gray-100 w-11 h-11 flex items-center justify-center text-black text-sm font-extrabold",
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
  ],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1000,
  },
});
