import type { AstroIntegration } from "astro";
import { fileURLToPath } from "url";
import path from "node:path";

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

        const mappingDestination =
          options?.mappingFile === false
            ? false
            : typeof options?.mappingFile === "string"
              ? path.resolve(options.mappingFile)
              : path.resolve(dist, "..", "mapping.json");

        const cssShuffler = new CSSShuffle({
          ...options,
          mappingFile: mappingDestination,
        });

        await cssShuffler.obfuscate(dist);
        cssShuffler.printStatsTable();
      },
    },
  };
}
