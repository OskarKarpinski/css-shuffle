import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { Renamer } from "./renamer.js";
import { CSSObfuscator } from "./css-obfuscator.js";
import { JSObfuscator } from "./js-obfuscator.js";
import { debugLog, debugReplace } from "./logger.js";
import { safeReplaceAssetReference } from "./hasher.js";

export class HTMLObfuscator {
  constructor(
    private renamer: Renamer,
    private cssObfuscator: CSSObfuscator,
    private jsObfuscator: JSObfuscator,
  ) {}

  async searchForProtectedNames(html: string): Promise<void> {
    const $ = cheerio.load(html);
    $('[href*="#"]').each((_, e) => {
      const href = $(e).attr("href")?.trim();
      if (!href) return;
      // Skip external links (e.g. https://example.com/#anchor or //example.com/#anchor)
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
        return;
      }
      const hashIndex = href.indexOf("#");
      if (hashIndex === -1) return;
      let fragment = href.slice(hashIndex + 1).split(/[?&#]/)[0]?.trim();
      if (fragment) {
        try {
          fragment = decodeURIComponent(fragment);
        } catch {
          // Keep raw fragment if malformed URI encoding
        }
        if (fragment) {
          this.renamer.protect(fragment);
          debugLog("HTML", `Protected name: ${fragment}`);
        }
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
    const isDocument = /<!doctype|<html/i.test(html);
    const $ = isDocument ? cheerio.load(html) : cheerio.load(html, null, false);

    // Update <link> references if any assets were renamed
    if (assetRenames && assetRenames.size > 0) {
      $("link[href]").each((_, e) => {
        const href = $(e).attr("href");
        if (href) {
          let updatedHref = href;
          for (const [oldName, newName] of assetRenames) {
            updatedHref = safeReplaceAssetReference(updatedHref, oldName, newName);
          }
          if (updatedHref !== href) {
            $(e).attr("href", updatedHref);
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
      const rawClass = $(e).attr("class");
      if (!rawClass) return;
      const classes = rawClass.split(/\s+/).filter(Boolean);
      if (classes.length === 0) return;
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
      const id = $(e).attr("id")?.trim();
      if (!id) return;
      const newId = this.renamer.rename(id);
      $(e).attr("id", newId);
      debugReplace("HTML", "[id]", "id", id, newId);
    });

    // Replace for attributes
    $("[for]").each((_, e) => {
      const forVal = $(e).attr("for")?.trim();
      if (!forVal) return;
      const newId = this.renamer.rename(forVal);
      $(e).attr("for", newId);
      debugReplace("HTML", "[for]", "id", forVal, newId);
    });

    // Replace form-associated single ID reference attributes
    const singleIdAttrs = ["list", "form", "popovertarget"];
    for (const attr of singleIdAttrs) {
      $(`[${attr}]`).each((_, e) => {
        const id = $(e).attr(attr)?.trim();
        if (id) {
          const newId = this.renamer.rename(id);
          $(e).attr(attr, newId);
          debugReplace("HTML", `[${attr}]`, "id", id, newId);
        }
      });
    }

    // Replace SVG URL references like fill="url(#my-gradient)"
    const svgUrlAttrs = [
      "fill",
      "stroke",
      "clip-path",
      "mask",
      "filter",
      "marker-start",
      "marker-mid",
      "marker-end",
    ];
    for (const attr of svgUrlAttrs) {
      $(`[${attr}*="url(#"]`).each((_, e) => {
        const value = $(e).attr(attr);
        if (value) {
          const newValue = value.replace(/url\(#([^)]+)\)/g, (_, id) => {
            return `url(#${this.renamer.get(id)})`;
          });
          if (newValue !== value) {
            $(e).attr(attr, newValue);
            debugReplace("HTML", attr, "svg-url", value, newValue);
          }
        }
      });
    }

    // Replace SVG <use href="#id"> references
    $("use").each((_, e) => {
      for (const attr of ["href", "xlink:href"]) {
        const value = $(e).attr(attr);
        if (value && value.startsWith("#")) {
          const id = value.slice(1);
          const newId = this.renamer.get(id);
          const newValue = `#${newId}`;
          $(e).attr(attr, newValue);
          debugReplace("HTML", `use[${attr}]`, "svg-use", value, newValue);
        }
      }
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
        const value = $(e).attr(attr)?.trim();
        if (!value) return;
        // These attributes can contain multiple space-separated IDs
        const ids = value.split(/\s+/).filter(Boolean);
        if (ids.length === 0) return;
        const newValue = ids.map((id) => this.renamer.rename(id)).join(" ");
        $(e).attr(attr, newValue);
        debugReplace("HTML", attr, "id", value, newValue);
      });
    }

    // Replace CSS custom properties in inline style attributes
    $("[style*='--']").each((_, e) => {
      const style = $(e).attr("style");
      if (style) {
        const newStyle = style.replace(/--([a-zA-Z0-9_-]+)/g, (_, prop) => {
          return `--${this.renamer.get(prop)}`;
        });
        if (newStyle !== style) {
          $(e).attr("style", newStyle);
          debugReplace("HTML", "[style]", "css-var", style, newStyle);
        }
      }
    });

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
        result = safeReplaceAssetReference(result, oldName, newName);
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
