import path from "node:path";
import { fileURLToPath } from "node:url";
// When used as an installed package: import { CSSShuffle } from "css-shuffle";
import { CSSShuffle } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const shuffler = new CSSShuffle({
  safelist: ["safelisted-tag"],
  mappingFile: path.join(__dirname, "dist/mapping.json"),
});

console.log("Obfuscating ./src -> ./dist ...");
await shuffler.obfuscate(path.join(__dirname, "src"), path.join(__dirname, "dist"));

console.log("\nStatistics:");
shuffler.printStatsTable();

console.log("\nDone! Mapping saved to dist/mapping.json");
