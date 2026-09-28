import { defineConfig } from "vite";
import { cssShuffle } from "css-shuffle/vite";

export default defineConfig({
  plugins: [
    cssShuffle({
      safelist: [/^is-/],
      mappingFile: "dist/mapping.json",
    }),
  ],
});
