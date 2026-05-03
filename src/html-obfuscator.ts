import * as cheerio from "cheerio";

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

  /**
   * Obfuscate class and ID references inside a CSS selector string.
   */
  private obfuscateSelector(selector: string): string {
    return selector
      .replace(/\.([a-zA-Z0-9_-]+)/g, (_, cls) => {
        const obf = this.renamer.get(cls);
        return obf ? `.${obf}` : `.${cls}`;
      })
      .replace(/#([a-zA-Z0-9_-]+)/g, (_, id) => {
        const obf = this.renamer.get(id);
        return obf ? `#${obf}` : `#${id}`;
      });
  }

  /**
   * Obfuscate CSS found inside <style> tags in HTML.
   */
  async obfuscateCSSInHtml(html: string): Promise<string> {
    const $ = cheerio.load(html);
    const styles = $("style").toArray();
    for (const style of styles) {
      const $style = $(style);
      const content = $style.html();
      if (content) {
        const obfuscatedContent = await this.cssObfuscator.obfuscate(content);
        $style.html(obfuscatedContent);
      }
    }
    return $.html();
  }

  /**
   * Replace obfuscated class and ID names in HTML attributes
   * and obfuscate inline <script> contents.
   */
  async replaceNamesInHtml(html: string): Promise<string> {
    const $ = cheerio.load(html);

    $("[class]").each((_, e) => {
      const classes = $(e).attr("class").split(/\s+/).filter(Boolean);
      const newClasses = classes.map(
        (cls) => this.renamer.get(cls) || cls,
      );
      $(e).attr("class", newClasses.join(" "));
      debugReplace(
        "HTML",
        "[class]",
        "class",
        classes.join(" "),
        newClasses.join(" "),
      );
    });

    $("[id]").each((_, e) => {
      const id = $(e).attr("id");
      const newId = this.renamer.get(id);
      $(e).attr("id", newId);
      debugReplace("HTML", "[id]", "id", id, newId);
    });

    $("[for]").each((_, e) => {
      const id = $(e).attr("for");
      const newId = this.renamer.get(id);
      $(e).attr("for", newId);
      debugReplace("HTML", "[for]", "id", id, newId);
    });

    $('a[href^="#"]').each((_, e) => {
      const href = $(e).attr("href");
      const target = href.slice(1);
      const newTarget = this.renamer.get(target);
      $(e).attr("href", "#" + newTarget);
      debugReplace("HTML", 'a[href^="#"]', "anchor", target, newTarget);
    });

    const scripts = $("script").toArray();
    for (const script of scripts) {
      const $script = $(script);
      const content = $script.html();
      if (content) {
        const obfuscatedContent = await this.jsObfuscator.obfuscate(content);
        $script.html(obfuscatedContent);
      }
    }

    return $.html();
  }
}
