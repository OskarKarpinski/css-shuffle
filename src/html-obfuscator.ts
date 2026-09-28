import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { Renamer } from "./renamer.js";
import { CSSObfuscator } from "./css-obfuscator.js";
import { JSObfuscator } from "./js-obfuscator.js";
import { debugLog, debugReplace } from "./logger.js";

export class HTMLObfuscator {
  constructor(
    private renamer: Renamer,
    private cssObfuscator: CSSObfuscator,
    private jsObfuscator: JSObfuscator,
  ) {}

  async searchForProtectedNames(html: string): Promise<void> {
    const $ = cheerio.load(html);
    $('[href*="#"]').each((_, e) => {
      const href = $(e).attr("href")!;
      const hashIndex = href.indexOf("#");
      const fragment = href.slice(hashIndex + 1);
      if (fragment) {
        this.renamer.protect(fragment);
        debugLog("HTML", `Protected name: ${fragment}`);
      }
    });
  }

  /**
   * Process an HTML file in a single pass: obfuscate CSS in <style> tags,
   * replace class/id/for attributes, and obfuscate inline <script> contents.
   * Also updates asset references if files were renamed (e.g. cache-busted CSS).
   * Returns the transformed HTML along with the original size for stats tracking.
   */
  async processHtml(
    html: string,
    assetRenames?: Map<string, string>,
  ): Promise<{ result: string; originalSize: number }> {
    const originalSize = html.length;
    const $ = cheerio.load(html);

    // Update <link> references if any assets were renamed
    if (assetRenames && assetRenames.size > 0) {
      $("link[href]").each((_, e) => {
        const href = $(e).attr("href");
        if (href) {
          for (const [oldName, newName] of assetRenames) {
            if (href.includes(oldName)) {
              $(e).attr("href", href.replaceAll(oldName, newName));
            }
          }
        }
      });
    }

    // Obfuscate CSS in <style> tags
    const styles = $("style").toArray();
    for (const style of styles) {
      const $style = $(style);
      const content = $style.html();
      if (content) {
        const obfuscatedContent = await this.cssObfuscator.obfuscate(content);
        $style.html(obfuscatedContent);
      }
    }

    // Replace class attributes
    $("[class]").each((_, e) => {
      const classes = $(e).attr("class")!.split(/\s+/).filter(Boolean);
      const newClasses = classes.map((cls) => this.renamer.rename(cls));
      $(e).attr("class", newClasses.join(" "));
      debugReplace(
        "HTML",
        "[class]",
        "class",
        classes.join(" "),
        newClasses.join(" "),
      );
    });

    // Replace id attributes
    $("[id]").each((_, e) => {
      const id = $(e).attr("id")!;
      const newId = this.renamer.rename(id);
      $(e).attr("id", newId);
      debugReplace("HTML", "[id]", "id", id, newId);
    });

    // Replace for attributes
    $("[for]").each((_, e) => {
      const id = $(e).attr("for")!;
      const newId = this.renamer.rename(id);
      $(e).attr("for", newId);
      debugReplace("HTML", "[for]", "id", id, newId);
    });

    // Replace ARIA ID-reference attributes
    const ariaIdAttrs = [
      "aria-labelledby",
      "aria-describedby",
      "aria-controls",
      "aria-owns",
      "aria-activedescendant",
      "aria-details",
      "aria-errormessage",
      "aria-flowto",
    ];
    for (const attr of ariaIdAttrs) {
      $(`[${attr}]`).each((_, e) => {
        const value = $(e).attr(attr)!;
        // These attributes can contain multiple space-separated IDs
        const newValue = value
          .split(/\s+/)
          .map((id) => this.renamer.rename(id))
          .join(" ");
        $(e).attr(attr, newValue);
        debugReplace("HTML", attr, "id", value, newValue);
      });
    }

    // Obfuscate inline <script> contents
    const scripts = this.javascriptScripts($);
    for (const script of scripts) {
      const $script = $(script);
      const content = $script.html();
      if (content) {
        const obfuscatedContent = await this.jsObfuscator.obfuscate(content);
        $script.html(obfuscatedContent);
      }
    }

    let result = $.html();
    if (assetRenames && assetRenames.size > 0) {
      for (const [oldName, newName] of assetRenames) {
        if (result.includes(oldName)) {
          result = result.replaceAll(oldName, newName);
        }
      }
    }

    return { result, originalSize };
  }

  private javascriptScripts($: cheerio.CheerioAPI): AnyNode[] {
    return $("script")
      .toArray()
      .filter((script) => {
        const type = $(script).attr("type")?.trim().toLowerCase();
        return (
          type === undefined ||
          type === "" ||
          type === "text/javascript" ||
          type === "application/javascript" ||
          type === "module"
        );
      });
  }
}
