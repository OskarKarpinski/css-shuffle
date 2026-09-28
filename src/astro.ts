import type { AstroIntegration } from "astro";
import { fileURLToPath } from "url";

import { CSSShuffle, type CSSShuffleOptions } from "./css-shuffle.js";

export interface AstroCSSShuffleOptions extends CSSShuffleOptions {}

export default function cssShuffleIntegration(
  options?: AstroCSSShuffleOptions,
): AstroIntegration {
  return {
    name: "css-shuffle",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const dist = fileURLToPath(dir);

        const cssShuffler = new CSSShuffle(options);

        await cssShuffler.obfuscate(dist);
        cssShuffler.printStatsTable();

        cssShuffler.saveMappingJSON(`${dist}/../mapping.json`);
      },
    },
  };
}
