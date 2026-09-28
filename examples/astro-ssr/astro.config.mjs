import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import cssShuffle from "css-shuffle/astro";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    cssShuffle({
      safelist: ["server-status"],
      mappingFile: "dist/mapping.json",
    }),
  ],
});
