import type { Plugin } from "vite";
import path from "node:path";
import fs from "node:fs";

import { Renamer } from "./renamer.js";
import { CSSObfuscator } from "./css-obfuscator.js";
import { JSObfuscator } from "./js-obfuscator.js";
import { HTMLObfuscator } from "./html-obfuscator.js";

export interface ViteCSSShuffleOptions {
  /**
   * List of class names, IDs, or RegExp patterns to preserve from obfuscation.
   */
  safelist?: (string | RegExp)[];

  /**
   * File path to write the JSON mapping file. If `false`, mapping file output is disabled.
   * @default "mapping.json"
   */
  mappingFile?: string | false;

  /**
   * Optional custom patterns or file paths to exclude from obfuscation.
   */
  exclude?: (string | RegExp)[];
}

/**
 * Replace HTML class, id, for, ARIA, and template attributes in code strings.
 */
export function transformTemplateAttributes(
  code: string,
  renamer: Renamer,
): string {
  // 1. Replace class attributes: class="..." and class='...'
  let result = code.replace(
    /\bclass=(["'])(.*?)\1/g,
    (match, quote, val) => {
      const parts = val.split(/\s+/).filter(Boolean);
      if (parts.length === 0) return match;
      const newClasses = parts.map((cls: string) => renamer.get(cls)).join(" ");
      return `class=${quote}${newClasses}${quote}`;
    },
  );

  // 2. Replace id, for, list, form, popovertarget attributes
  result = result.replace(
    /\b(id|for|list|form|popovertarget)=(["'])(.*?)\2/g,
    (match, attr, quote, val) => {
      const trimmed = val.trim();
      if (!trimmed) return match;
      return `${attr}=${quote}${renamer.get(trimmed)}${quote}`;
    },
  );

  // 3. Replace space-separated ARIA ID references
  result = result.replace(
    /\b(aria-(?:labelledby|describedby|controls|owns|details|errormessage|flowto))=(["'])(.*?)\2/g,
    (match, attr, quote, val) => {
      const parts = val.split(/\s+/).filter(Boolean);
      if (parts.length === 0) return match;
      const newIds = parts.map((id: string) => renamer.get(id)).join(" ");
      return `${attr}=${quote}${newIds}${quote}`;
    },
  );

  // 4. Replace Astro addAttribute("...", "class" | "id" | "for")
  result = result.replace(
    /\baddAttribute\(\s*(["'])(.*?)\1\s*,\s*(["'])(class|id|for)\3\s*\)/g,
    (match, valQuote, rawVal, attrQuote, attrName) => {
      if (attrName === "class") {
        const parts = rawVal.split(/\s+/).filter(Boolean);
        const newClasses = parts.map((cls: string) => renamer.get(cls)).join(" ");
        return `addAttribute(${valQuote}${newClasses}${valQuote}, ${attrQuote}${attrName}${attrQuote})`;
      } else {
        const trimmed = rawVal.trim();
        return `addAttribute(${valQuote}${renamer.get(trimmed)}${valQuote}, ${attrQuote}${attrName}${attrQuote})`;
      }
    },
  );

  // 5. Replace SVG URL references url(#...) and use href="#..."
  result = result.replace(/url\(#([^)]+)\)/g, (_, id) => {
    return `url(#${renamer.get(id)})`;
  });
  result = result.replace(
    /\bhref=(["'])#([^"']+)\1/g,
    (_, quote, id) => {
      return `href=${quote}#${renamer.get(id)}${quote}`;
    },
  );

  return result;
}

export function cssShuffleVitePlugin(
  options?: ViteCSSShuffleOptions,
): Plugin {
  const renamer = new Renamer(options?.safelist);
  const cssObfuscator = new CSSObfuscator(renamer);
  const jsObfuscator = new JSObfuscator(renamer);
  const htmlObfuscator = new HTMLObfuscator(
    renamer,
    cssObfuscator,
    jsObfuscator,
  );

  const shouldExclude = (id: string): boolean => {
    if (id.includes("node_modules")) return true;
    if (options?.exclude) {
      for (const pattern of options.exclude) {
        if (typeof pattern === "string" && id.includes(pattern)) return true;
        if (pattern instanceof RegExp && pattern.test(id)) return true;
      }
    }
    return false;
  };

  return {
    name: "css-shuffle",
    enforce: "pre",

    /**
     * Transform CSS files (both regular .css and virtual styles from .astro/.vue/.svelte).
     */
    async transform(code: string, id: string) {
      if (shouldExclude(id)) return null;

      if (/\.(css|scss|sass|less|styl|stylus)($|\?)/.test(id)) {
        const obfuscatedCss = await cssObfuscator.obfuscate(code, id);
        return {
          code: obfuscatedCss,
          map: null,
        };
      }

      return null;
    },

    /**
     * Transform JS/MJS chunks (Astro pages, client scripts, SSR chunks).
     */
    async renderChunk(code: string, chunk) {
      if (shouldExclude(chunk.fileName)) return null;

      // 1. Obfuscate DOM calls in JS (querySelector, getElementById, classList, etc.)
      let transformed = await jsObfuscator.obfuscate(code);

      // 2. Obfuscate HTML template literals & attributes in the chunk
      transformed = transformTemplateAttributes(transformed, renamer);

      return {
        code: transformed,
        map: null,
      };
    },

    /**
     * Transform HTML entrypoints for Vite SPA/MPA.
     */
    async transformIndexHtml(html: string) {
      const { result } = await htmlObfuscator.processHtml(html);
      return result;
    },

    /**
     * Emit mapping.json and process any static HTML assets.
     */
    async generateBundle(_options, bundle) {
      // Process any emitted HTML assets
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (
          fileName.endsWith(".html") &&
          asset.type === "asset" &&
          typeof asset.source === "string"
        ) {
          const { result } = await htmlObfuscator.processHtml(asset.source);
          asset.source = result;
        }
      }

      // Emit mapping JSON file
      if (options?.mappingFile !== false) {
        const mappingContent = renamer.getMappingJSON();
        const mappingFileName =
          typeof options?.mappingFile === "string" &&
          !path.isAbsolute(options.mappingFile)
            ? options.mappingFile
            : "mapping.json";

        this.emitFile({
          type: "asset",
          fileName: mappingFileName,
          source: mappingContent,
        });

        // If an absolute path is provided, also write to disk directly
        if (
          typeof options?.mappingFile === "string" &&
          path.isAbsolute(options.mappingFile)
        ) {
          const targetDir = path.dirname(options.mappingFile);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          fs.writeFileSync(options.mappingFile, mappingContent, "utf-8");
        }
      }
    },
  };
}

export const cssShuffle = cssShuffleVitePlugin;
export const cssShufflePlugin = cssShuffleVitePlugin;
export default cssShuffleVitePlugin;
