import fs from "fs";
import { globby } from "globby";
import * as cheerio from "cheerio";
import { Table } from "console-table-printer";
import prettyBytes from "pretty-bytes";
import postcss, { type Root } from "postcss";
import selectorParser from "postcss-selector-parser";
import valueParser from "postcss-value-parser";
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";

import * as t from "@babel/types";

import { Renamer } from "./renamer.js";
import { isDomElement } from "./javascript-obfuscator.js";
import {
  debugLog,
  debugHeader,
  debugScan,
  debugReplace,
  debugSummary,
  debugError,
} from "./logger.js";

export class CSSShuffle {
  /** Generates and tracks obfuscated name mappings. */
  private renamer = new Renamer();

  /** Tracks file size changes for summary reporting. */
  private readonly stats = new Map<
    string,
    { originalSize: number; newSize: number }
  >();

  /** Rename a name and store the mapping. */
  private obfuscateName(originalName: string): string {
    const newName = this.renamer.rename(originalName);
    debugLog("obfuscate", `${originalName} -> ${newName}`);
    return newName;
  }

  /** Retrieve an obfuscated name, or return the original if not found. */
  private getObfuscateName(key: string): string {
    return this.renamer.get(key);
  }

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

  /**
   * Parse JavaScript source and obfuscate all CSS class/ID references
   * in DOM API calls and property assignments.
   */
  async obfuscateJS(js: string): Promise<string> {
    const ast = parser.parse(js, {
      sourceType: "script",
      plugins: ["classProperties"],
      errorRecovery: true,
    });

    const getStringValue = (node: t.Node): string | null => {
      if (t.isStringLiteral(node)) return node.value;
      if (
        t.isTemplateLiteral(node) &&
        node.quasis.length === 1 &&
        node.expressions.length === 0
      ) {
        return node.quasis[0].value.cooked || node.quasis[0].value.raw;
      }
      return null;
    };

    const createStringNode = (
      originalNode: t.Node,
      value: string,
    ): t.StringLiteral | t.TemplateLiteral => {
      if (t.isTemplateLiteral(originalNode)) {
        return t.templateLiteral(
          [t.templateElement({ raw: value, cooked: value }, true)],
          [],
        );
      }
      return t.stringLiteral(value);
    };

    traverse.default(ast, {
      CallExpression: (path) => {
        const { callee, arguments: args } = path.node;

        if (!t.isMemberExpression(callee)) return;
        const object = callee.object;
        const method = callee.property;

        if (!t.isIdentifier(method)) return;

        /**
         * Handle classList.add/remove/toggle/contains/replace calls on DOM elements.
         * Obfuscates class names passed as arguments.
         */
        if (
          t.isMemberExpression(object) &&
          t.isIdentifier(object.property, { name: "classList" }) &&
          ["add", "remove", "toggle", "contains", "replace"].includes(
            method.name,
          ) &&
          isDomElement(object.object, path.scope) // ← guard
        ) {
          args.forEach((arg, i) => {
            const val = getStringValue(arg);
            if (val !== null) {
              const obf = this.getObfuscateName(val);
              debugReplace("JS", "classList", "class", val, obf);
              if (obf) args[i] = createStringNode(arg, obf);
            }
          });
        }

        /**
         * Handle querySelector / querySelectorAll calls.
         * Obfuscates class and ID selectors in the query string.
         */
        if (
          ["querySelector", "querySelectorAll"].includes(method.name) &&
          args.length === 1 &&
          isDomElement(object, path.scope) // ← guard
        ) {
          const val = getStringValue(args[0]);
          if (val !== null) {
            debugScan("JS", "querySelector", "selector", val);
            const obf = this.obfuscateSelector(val);
            debugReplace("JS", "querySelector", "selector", val, obf);
            args[0] = createStringNode(args[0], obf);
          }
        }

        /**
         * Handle getElementById calls. Obfuscates the ID argument.
         */
        if (
          method.name === "getElementById" &&
          args.length === 1 &&
          isDomElement(object, path.scope) // ← guard
        ) {
          const val = getStringValue(args[0]);
          if (val !== null) {
            const obf = this.getObfuscateName(val);
            debugReplace("JS", "getElementById", "id", val, obf);
            if (obf) args[0] = createStringNode(args[0], obf);
          }
        }

        /**
         * Handle getElementsByClassName calls. Obfuscates the class name argument.
         */
        if (
          method.name === "getElementsByClassName" &&
          args.length === 1 &&
          isDomElement(object, path.scope) // ← guard
        ) {
          const val = getStringValue(args[0]);
          if (val !== null) {
            const obf = this.getObfuscateName(val);
            debugReplace("JS", "getElementsByClassName", "class", val, obf);
            if (obf) args[0] = createStringNode(args[0], obf);
          }
        }

        /**
         * Handle setAttribute('class'/'id', ...) calls.
         * Obfuscates the class or ID value in the second argument.
         */
        if (
          method.name === "setAttribute" &&
          args.length === 2 &&
          isDomElement(object, path.scope) // ← guard
        ) {
          const attrName = getStringValue(args[0]);
          const attrVal = getStringValue(args[1]);
          if (attrName !== null && attrVal !== null) {
            if (attrName === "class") {
              const newVal = attrVal
                .split(/\s+/)
                .map((cls) => this.getObfuscateName(cls) || cls)
                .join(" ");
              debugReplace("JS", "setAttribute", "class", attrVal, newVal);
              args[1] = createStringNode(args[1], newVal);
            } else if (attrName === "id") {
              const obf = this.getObfuscateName(attrVal);
              debugReplace("JS", "setAttribute", "id", attrVal, obf);
              if (obf) args[1] = createStringNode(args[1], obf);
            }
          }
        }
      },

      /**
       * Handle element.className = 'foo bar' assignments.
       * Obfuscates each class name in the assigned string.
       */
      AssignmentExpression: (path) => {
        const { left, right } = path.node;
        if (
          t.isMemberExpression(left) &&
          t.isIdentifier(left.property, { name: "className" }) &&
          isDomElement(left.object, path.scope) // ← guard
        ) {
          const val = getStringValue(right);
          if (val !== null) {
            const newVal = val
              .split(/\s+/)
              .map((cls) => this.getObfuscateName(cls) || cls)
              .join(" ");
            debugReplace("JS", "className", "class", val, newVal);
            path.node.right = createStringNode(right, newVal);
          }
        }
      },
    });

    return generate.default(ast, { retainLines: true }, js).code;
  }

  /**
   * Parse CSS source and obfuscate all class selectors, ID selectors,
   * and custom property names (--*) throughout rules, @property at-rules,
   * and var() references.
   */
  async obfuscateCSS(css: string): Promise<string> {
    return await postcss([
      (root: Root) => {
        debugHeader("Obfuscating CSS selectors");
        root.walkRules((rule) => {
          rule.selector = selectorParser((selectors) => {
            selectors.walkClasses((node) => {
              debugScan("CSS", rule.selector, "class", node.value);
              node.value = this.obfuscateName(node.value);
            });
            selectors.walkIds((node) => {
              debugScan("CSS", rule.selector, "id", node.value);
              node.value = this.obfuscateName(node.value);
            });
          }).processSync(rule.selector);
        });

        // Obfuscated properties like this:
        //  @property --tw-font-weight{syntax:"*";inherits:false}
        root.walkAtRules("property", (atRule) => {
          debugScan("CSS", "@property", "at-rule", atRule.params);

          if (atRule.params.startsWith("--")) {
            const original = atRule.params;
            const newName = `--${this.obfuscateName(atRule.params.substring(2))}`;
            debugReplace(
              "CSS",
              "@property",
              "custom property",
              original,
              newName,
            );
            atRule.params = newName;
          }
        });

        root.walkDecls((decl) => {
          if (decl.prop.startsWith("--")) {
            const original = decl.prop;
            const newName = `--${this.obfuscateName(decl.prop.substring(2))}`;
            debugReplace(
              "CSS",
              decl.prop,
              "custom property",
              original,
              newName,
            );
            decl.prop = newName;
          }

          const parsedValue = valueParser(decl.value);
          parsedValue.walk((node) => {
            if (node.type === "word" && node.value.startsWith("--")) {
              debugScan("CSS value", decl.prop, "var reference", node.value);
              node.value = `--${this.obfuscateName(node.value.substring(2))}`;
            }
          });
          decl.value = parsedValue.toString();
        });
      },
    ])
      .process(css, { from: undefined })
      .then((result) => result.css);
  }

  private async obfuscateCSSInHtml(html: string): Promise<string> {
    const $ = cheerio.load(html);
    const styles = $("style").toArray();
    for (const style of styles) {
      const $style = $(style);
      const content = $style.html();
      if (content) {
        const obfuscatedContent = await this.obfuscateCSS(content);
        $style.html(obfuscatedContent);
      }
    }
    return $.html();
  }

  /**
   * Obfuscate class and ID references inside a CSS selector string
   * (used for querySelector values that are not full CSS files).
   */
  private obfuscateSelector(selector: string): string {
    return selector
      .replace(/\.([a-zA-Z0-9_-]+)/g, (_, cls) => {
        const obf = this.getObfuscateName(cls);
        return obf ? `.${obf}` : `.${cls}`;
      })
      .replace(/#([a-zA-Z0-9_-]+)/g, (_, id) => {
        const obf = this.getObfuscateName(id);
        return obf ? `#${obf}` : `#${id}`;
      });
  }

  private async replaceNamesInHtml(html: string): Promise<string> {
    const $ = cheerio.load(html);

    $("[class]").each((_, e) => {
      const classes = $(e).attr("class").split(/\s+/).filter(Boolean);
      const newClasses = classes.map(
        (cls) => this.getObfuscateName(cls) || cls,
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
      const newId = this.getObfuscateName(id);
      $(e).attr("id", newId);
      debugReplace("HTML", "[id]", "id", id, newId);
    });

    $("[for]").each((_, e) => {
      const id = $(e).attr("for");
      const newId = this.getObfuscateName(id);
      $(e).attr("for", newId);
      debugReplace("HTML", "[for]", "id", id, newId);
    });

    $('a[href^="#"]').each((_, e) => {
      const href = $(e).attr("href");
      const target = href.slice(1);
      const newTarget = this.getObfuscateName(target);
      $(e).attr("href", "#" + newTarget);
      debugReplace("HTML", 'a[href^="#"]', "anchor", target, newTarget);
    });

    const scripts = $("script").toArray();
    for (const script of scripts) {
      const $script = $(script);
      const content = $script.html();
      if (content) {
        const obfuscatedContent = await this.obfuscateJS(content);
        $script.html(obfuscatedContent);
      }
    }

    return $.html();
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

    const htmlFiles = await globby(["**/*.html"], {
      cwd: dist,
      absolute: true,
    });
    const cssFiles = await globby(["**/*.css"], { cwd: dist, absolute: true });

    debugHeader("Obfuscating CSS files");

    // Obfuscate CSS files
    for (const cssFile of cssFiles) {
      debugLog("CSS file", cssFile);
      const cssContent = fs.readFileSync(cssFile, "utf-8");
      const obfuscatedCss = await this.obfuscateCSS(cssContent);
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

    debugHeader("Obfuscating CSS in HTML <style> tags");

    // Obfuscate CSS in <style> tag in HTML files
    for (const htmlFile of htmlFiles) {
      debugLog("HTML file (CSS)", htmlFile);
      const htmlContent = fs.readFileSync(htmlFile, "utf-8");
      let obfuscatedHtmlContent = await this.obfuscateCSSInHtml(htmlContent);
      fs.writeFileSync(htmlFile, obfuscatedHtmlContent, "utf-8");

      const oldSize = htmlContent.length;
      const newSize = obfuscatedHtmlContent.length;
      if (oldSize != newSize) {
        const fileName = htmlFile.replace(dist, "");
        this.stats.set(fileName, {
          originalSize: oldSize,
          newSize: newSize,
        });
      }
    }

    debugHeader("Replacing names in HTML");

    // Export export obfuscated names to HTML
    for (const htmlFile of htmlFiles) {
      debugLog("HTML file (names)", htmlFile);
      const htmlContent = fs.readFileSync(htmlFile, "utf-8");
      let newHtmlContent = await this.replaceNamesInHtml(htmlContent);
      fs.writeFileSync(htmlFile, newHtmlContent, "utf-8");

      let originalSize = htmlContent.length;
      const newSize = newHtmlContent.length;
      if (originalSize != newSize) {
        const fileName = htmlFile.replace(dist, "");

        // Track original size for files that may have been partially obfuscated
        // in a previous pass (e.g. inline CSS in <style> was already processed)
        const fileStats = this.stats.get(fileName);
        if (fileStats != undefined) originalSize = fileStats.originalSize;

        this.stats.set(fileName, {
          originalSize: originalSize,
          newSize: newSize,
        });
      }
    }

    debugSummary("Obfuscation complete");
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
    debugSummary("Stats table printed");
  }
}
