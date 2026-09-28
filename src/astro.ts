import type { AstroIntegration } from "astro";
import { fileURLToPath } from "url";
import path from "node:path";

import { cssShuffleVitePlugin, type ViteCSSShuffleOptions } from "./vite.js";
import { CSSShuffle, type CSSShuffleOptions } from "./css-shuffle.js";

export interface AstroCSSShuffleOptions
  extends ViteCSSShuffleOptions,
    CSSShuffleOptions {}

export default function cssShuffleIntegration(
  options?: AstroCSSShuffleOptions,
): AstroIntegration {
  let vitePluginExecuted = false;

  return {
    name: "css-shuffle",
    hooks: {
      "astro:config:setup": ({ updateConfig, config }) => {
        const outDir = fileURLToPath(config.outDir);
        const resolvedMapping =
          options?.mappingFile === false
            ? false
            : typeof options?.mappingFile === "string"
              ? path.isAbsolute(options.mappingFile)
                ? options.mappingFile
                : path.resolve(outDir, options.mappingFile)
              : path.resolve(outDir, "mapping.json");

        const vitePlugin = cssShuffleVitePlugin({
          ...options,
          mappingFile: resolvedMapping,
        });

        const originalGenerateBundle = vitePlugin.generateBundle;
        vitePlugin.generateBundle = async function (bundleOpts, bundle, isWrite) {
          vitePluginExecuted = true;
          if (typeof originalGenerateBundle === "function") {
            await originalGenerateBundle.call(this, bundleOpts, bundle, isWrite);
          }
        };

        updateConfig({
          vite: {
            plugins: [vitePlugin],
          },
        });
      },
      "astro:build:done": async ({ dir }) => {
        // If Vite plugin handled the build (standard Astro build), do not re-run post-build
        if (vitePluginExecuted) {
          return;
        }

        // Fallback for direct invocations or legacy setups where Vite plugin was bypassed
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
