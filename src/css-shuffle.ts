import fs from "fs";
import path from "node:path";
import { Table } from "console-table-printer";
import prettyBytes from "pretty-bytes";

import { Renamer } from "./renamer.js";
import { CSSObfuscator } from "./css-obfuscator.js";
import { JSObfuscator } from "./js-obfuscator.js";
import { HTMLObfuscator } from "./html-obfuscator.js";
import { debugLog, debugHeader } from "./logger.js";
import { computeHash, getNewHashedFilename, safeReplaceAssetReference } from "./hasher.js";

export interface CSSShuffleOptions {
  /**
   * Control CSS filename re-hashing after obfuscation to prevent production cache loops.
   * - `true` (default): Re-hash CSS files that already contain a content hash (e.g. Astro / Vite `[name].[hash].css`).
   * - `"all"`: Re-hash all CSS files, appending a hash even to unhashed files (e.g. `styles.css` -> `styles.[hash].css`).
   * - `false`: Disable re-hashing (keep original filenames).
   * @default true
   */
  hash?: boolean | "all";

  /**
   * List of class names, IDs, or RegExp patterns to preserve from obfuscation.
   */
  safelist?: (string | RegExp)[];

  /**
   * Optional file path to output the JSON mapping file. If `false`, mapping file output is disabled.
   */
  mappingFile?: string | false;
}

export class CSSShuffle {
  private options: CSSShuffleOptions;

  /** Generates and tracks obfuscated name mappings. */
  private renamer: Renamer;

  /** Delegated obfuscators. */
  private cssObfuscator: CSSObfuscator;
  private jsObfuscator: JSObfuscator;
  private htmlObfuscator: HTMLObfuscator;

  constructor(options?: CSSShuffleOptions) {
    this.options = {
      hash: options?.hash ?? true,
      safelist: options?.safelist,
      mappingFile: options?.mappingFile,
    };
    this.renamer = new Renamer(this.options.safelist);
    this.cssObfuscator = new CSSObfuscator(this.renamer);
    this.jsObfuscator = new JSObfuscator(this.renamer);
    this.htmlObfuscator = new HTMLObfuscator(
      this.renamer,
      this.cssObfuscator,
      this.jsObfuscator,
    );
  }

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
  saveMappingJSON(targetPath: string) {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const mapping = this.getMappingJSON();
    fs.writeFileSync(targetPath, mapping, "utf-8");
  }

  async obfuscate(
    input: string,
    dist?: string,
    options?: CSSShuffleOptions,
  ) {
    const resolvedInput = path.resolve(input);
    const resolvedDist = dist != undefined ? path.resolve(dist) : resolvedInput;

    const effectiveHashMode = options?.hash ?? this.options.hash ?? true;
    if (options?.safelist) {
      this.renamer.safelist.push(...options.safelist);
    }

    if (resolvedInput !== resolvedDist) {
      // copy files from input dir to output dir
      if (fs.existsSync(resolvedDist)) {
        fs.rmSync(resolvedDist, { recursive: true, force: true });
      }
      fs.mkdirSync(resolvedDist, { recursive: true });
      fs.cpSync(resolvedInput, resolvedDist, { recursive: true });
    }
    dist = resolvedDist;

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

    // Track renamed assets (oldName -> newName) for updating references in HTML, JS, CSS
    const assetRenames = new Map<string, string>();
    const currentCssFiles: string[] = [];

    // Obfuscate CSS files
    for (const cssFile of cssFiles) {
      debugLog("CSS file", cssFile);
      const cssContent = fs.readFileSync(cssFile, "utf-8");
      const obfuscatedCss = await this.cssObfuscator.obfuscate(cssContent, cssFile);

      const oldSize = cssContent.length;
      const newSize = obfuscatedCss.length;

      let targetCssFile = cssFile;
      const newHash = computeHash(obfuscatedCss);
      const newBasename = getNewHashedFilename(
        cssFile,
        newHash,
        effectiveHashMode,
      );

      if (newBasename && newBasename !== path.basename(cssFile)) {
        targetCssFile = path.join(path.dirname(cssFile), newBasename);
        const oldBasename = path.basename(cssFile);
        const oldRel = path.relative(dist, cssFile).replace(/\\/g, "/");
        const newRel = path.relative(dist, targetCssFile).replace(/\\/g, "/");

        assetRenames.set(oldBasename, newBasename);
        assetRenames.set(oldRel, newRel);

        fs.writeFileSync(targetCssFile, obfuscatedCss, "utf-8");
        if (fs.existsSync(cssFile)) {
          fs.unlinkSync(cssFile);
        }

        const oldMapFile = `${cssFile}.map`;
        if (fs.existsSync(oldMapFile)) {
          fs.unlinkSync(oldMapFile);
        }
      } else {
        fs.writeFileSync(cssFile, obfuscatedCss, "utf-8");
      }
      currentCssFiles.push(targetCssFile);

      if (oldSize != newSize) {
        const fileName = path.relative(dist, targetCssFile).replace(/\\/g, "/");
        this.stats.set(fileName, {
          originalSize: oldSize,
          newSize: newSize,
        });
      }
    }

    // Sort assetRenames by length descending to prevent partial string matches
    const sortedAssetRenames = Array.from(assetRenames.entries()).sort(
      (a, b) => b[0].length - a[0].length,
    );

    // Update references in CSS files (e.g. @import)
    if (sortedAssetRenames.length > 0) {
      for (const currentCssFile of currentCssFiles) {
        if (!fs.existsSync(currentCssFile)) continue;
        let content = fs.readFileSync(currentCssFile, "utf-8");
        let changed = false;
        for (const [oldName, newName] of sortedAssetRenames) {
          const newContent = safeReplaceAssetReference(content, oldName, newName);
          if (newContent !== content) {
            content = newContent;
            changed = true;
          }
        }
        if (changed) {
          fs.writeFileSync(currentCssFile, content, "utf-8");
        }
      }
    }

    debugHeader("Processing HTML files");

    const assetRenameMap = new Map(sortedAssetRenames);

    // Process each HTML file in a single pass: inline CSS obfuscation,
    // class/id/for replacement, inline script obfuscation, and asset reference update
    for (const htmlFile of htmlFiles) {
      debugLog("HTML file", htmlFile);
      const htmlContent = fs.readFileSync(htmlFile, "utf-8");
      const { result, originalSize } =
        await this.htmlObfuscator.processHtml(htmlContent, assetRenameMap);
      fs.writeFileSync(htmlFile, result, "utf-8");

      const newSize = result.length;
      if (originalSize != newSize) {
        const fileName = path.relative(dist, htmlFile).replace(/\\/g, "/");
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

      if (sortedAssetRenames.length > 0) {
        for (const [oldName, newName] of sortedAssetRenames) {
          newJsContent = safeReplaceAssetReference(newJsContent, oldName, newName);
        }
      }

      fs.writeFileSync(jsFile, newJsContent, "utf-8");

      let originalSize = jsContent.length;
      const newSize = newJsContent.length;
      if (originalSize != newSize) {
        const fileName = path.relative(dist, jsFile).replace(/\\/g, "/");

        this.stats.set(fileName, {
          originalSize: originalSize,
          newSize: newSize,
        });
      }
    }

    const effectiveMappingFile =
      options?.mappingFile !== undefined
        ? options.mappingFile
        : this.options.mappingFile;
    if (typeof effectiveMappingFile === "string") {
      this.saveMappingJSON(path.resolve(effectiveMappingFile));
    }
  }

  printStatsTable() {
    const table = new Table();

    this.stats.forEach((stats, file) => {
      const diff = stats.originalSize - stats.newSize;
      const reduction =
        stats.originalSize > 0
          ? ((diff / stats.originalSize) * 100) | 0
          : 0;
      table.addRow({
        File: file,
        "Original Size": prettyBytes(stats.originalSize),
        "New Size": prettyBytes(stats.newSize),
        Reduced: `${reduction}%`,
      });
    });

    table.printTable();
  }
}
