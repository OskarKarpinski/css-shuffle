import { defineConfig } from "astro/config";
import cssShuffle from "css-shuffle/astro";

export default defineConfig({
  output: "static",
  integrations: [
    cssShuffle({
      // Preserve classes matching these names or regexes
      safelist: ["keep-me", /^preserve-/],
      mappingFile: "dist/mapping.json",
    }),
  ],
});
