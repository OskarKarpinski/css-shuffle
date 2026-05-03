import postcss, { type Root } from "postcss";
import selectorParser from "postcss-selector-parser";
import valueParser from "postcss-value-parser";

import { Renamer } from "./renamer.js";
import { debugHeader, debugScan, debugReplace } from "./logger.js";

export class CSSObfuscator {
  constructor(private renamer: Renamer) {}

  private obfuscateName(originalName: string): string {
    return this.renamer.rename(originalName);
  }

  /**
   * Parse CSS source and obfuscate all class selectors, ID selectors,
   * and custom property names (--*) throughout rules, @property at-rules,
   * and var() references.
   */
  async obfuscate(css: string): Promise<string> {
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
}
