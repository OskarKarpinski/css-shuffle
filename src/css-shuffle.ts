import fs from "fs";
import path from "node:path";
import { Table } from "console-table-printer";
import prettyBytes from "pretty-bytes";

import { Renamer } from "./renamer.js";
import { CSSObfuscator } from "./css-obfuscator.js";
import { JSObfuscator } from "./js-obfuscator.js";
import { HTMLObfuscator } from "./html-obfuscator.js";
import { debugLog, debugHeader } from "./logger.js";

export class CSSShuffle {
  /** Generates and tracks obfuscated name mappings. */
  private renamer = new Renamer();

  /** Delegated obfuscators. */
  private cssObfuscator = new CSSObfuscator(this.renamer);
  private jsObfuscator = new JSObfuscator(this.renamer);
  private htmlObfuscator = new HTMLObfuscator(
    this.renamer,
    this.cssObfuscator,
    this.jsObfuscator,
  );

  /** Tracks file size changes for summary reporting. */
  private readonly stats = new Map<
    string,
    { originalSize: number; newSize: number }
  >();

  /** Return the full original-to-obfuscated mapping. */
  getMapping(): Map<string, string> {
    return this.renamer.renames;
  }

  /** Return the mapping as a formatted JSON string. */
  getMappingJSON(): string {
    return JSON.stringify(Object.fromEntries(this.getMapping()), null, 2);
  }

  /** Write the mapping JSON to a file. */
  saveMappingJSON(path: string) {
    const mapping = this.getMappingJSON();
    fs.writeFileSync(path, mapping);
  }

  async obfuscate(input: string, dist?: string) {
    if (dist == undefined) {
      dist = input;
    }

    if (input != dist) {
      // copy files from input dir to output dir
      if (fs.existsSync(dist)) {
        fs.rmSync(dist, { recursive: true, force: true });
      }
      fs.mkdirSync(dist, { recursive: true });
      fs.cpSync(input, dist, { recursive: true });
    }

    const toAbsolute = (pattern: string) =>
      fs.globSync(pattern, { cwd: dist }).map((f) => path.resolve(dist, f));
    const htmlFiles = toAbsolute("**/*.html");
    const cssFiles = toAbsolute("**/*.css");
    const jsFiles = toAbsolute("**/*.{js,mjs,cjs}");

    // Scanning HTML files for protecting some names like when on the page is id="projects" and href="/#projects"
    debugHeader("Scanning HTML files for protected names");
    for (const htmlFile of htmlFiles) {
      debugLog("HTML file", htmlFile);
      const htmlContent = fs.readFileSync(htmlFile, "utf-8");
      await this.htmlObfuscator.searchForProtectedNames(htmlContent);
    }

    debugHeader("Obfuscating CSS files");

    // Obfuscate CSS files
    for (const cssFile of cssFiles) {
      debugLog("CSS file", cssFile);
      const cssContent = fs.readFileSync(cssFile, "utf-8");
      const obfuscatedCss = await this.cssObfuscator.obfuscate(cssContent);
      fs.writeFileSync(cssFile, obfuscatedCss, "utf-8");

      const oldSize = cssContent.length;
      const newSize = obfuscatedCss.length;
      if (oldSize != newSize) {
        const fileName = cssFile.replace(dist, "");
        this.stats.set(fileName, {
          originalSize: oldSize,
          newSize: newSize,
        });
      }
    }

    debugHeader("Processing HTML files");

    // Process each HTML file in a single pass: inline CSS obfuscation,
    // class/id/for replacement, and inline script obfuscation
    for (const htmlFile of htmlFiles) {
      debugLog("HTML file", htmlFile);
      const htmlContent = fs.readFileSync(htmlFile, "utf-8");
      const { result, originalSize } =
        await this.htmlObfuscator.processHtml(htmlContent);
      fs.writeFileSync(htmlFile, result, "utf-8");

      const newSize = result.length;
      if (originalSize != newSize) {
        const fileName = htmlFile.replace(dist, "");
        this.stats.set(fileName, {
          originalSize: originalSize,
          newSize: newSize,
        });
      }
    }

    debugHeader("Replacing names in JS");
    for (const jsFile of jsFiles) {
      debugLog("JS file (names)", jsFile);
      const jsContent = fs.readFileSync(jsFile, "utf-8");
      let newJsContent = await this.jsObfuscator.obfuscate(jsContent);
      fs.writeFileSync(jsFile, newJsContent, "utf-8");

      let originalSize = jsContent.length;
      const newSize = newJsContent.length;
      if (originalSize != newSize) {
        const fileName = jsFile.replace(dist, "");

        this.stats.set(fileName, {
          originalSize: originalSize,
          newSize: newSize,
        });
      }
    }
  }

  printStatsTable() {
    const table = new Table();

    this.stats.forEach((stats, file) => {
      table.addRow({
        File: file,
        "Original Size": prettyBytes(stats.originalSize),
        "New Size": prettyBytes(stats.newSize),
        Reduced: `${(((stats.originalSize - stats.newSize) / stats.originalSize) * 100) | 0}%`,
      });
    });

    table.printTable();
  }
}
