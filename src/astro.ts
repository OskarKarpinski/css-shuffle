import type { AstroIntegration } from "astro";
import { fileURLToPath } from "url";

import { CSSShuffle } from "./css-shuffle.js";

export default function cssShuffleIntegration(): AstroIntegration {
  return {
    name: "css-shuffle",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const dist = fileURLToPath(dir);

        const cssShuffler = new CSSShuffle();

        await cssShuffler.obfuscate(dist);
        cssShuffler.printStatsTable();

        cssShuffler.saveMappingJSON(`${dist}/../mapping.json`);
      },
    },
  };
}
