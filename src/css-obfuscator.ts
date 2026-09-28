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
  async obfuscate(css: string, from?: string): Promise<string> {
    return await postcss([
      (root: Root) => {
        debugHeader("Obfuscating CSS selectors");

        // Obfuscate @keyframes names
        const keyframeNames = new Set<string>();
        root.walkAtRules(/keyframes$/, (atRule) => {
          debugScan("CSS", atRule.name, "at-rule", atRule.params);
          const name = atRule.params.trim();
          if (name) {
            keyframeNames.add(name);
            const newName = this.obfuscateName(name);
            debugReplace("CSS", atRule.name, "keyframe", name, newName);
            atRule.params = newName;
          }
        });

        root.walkRules((rule) => {
          rule.selector = selectorParser((selectors) => {
            selectors.walkClasses((node) => {
              debugScan("CSS", rule.selector, "class", node.value);
              node.value = this.obfuscateName(node.value);
              const nodeWithRaws = node as { raws?: { value?: string } };
              if (nodeWithRaws.raws) {
                delete nodeWithRaws.raws.value;
              }
            });
            selectors.walkIds((node) => {
              debugScan("CSS", rule.selector, "id", node.value);
              node.value = this.obfuscateName(node.value);
              const nodeWithRaws = node as { raws?: { value?: string } };
              if (nodeWithRaws.raws) {
                delete nodeWithRaws.raws.value;
              }
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

          if (
            decl.prop === "animation-name" ||
            decl.prop === "-webkit-animation-name" ||
            decl.prop === "animation" ||
            decl.prop === "-webkit-animation"
          ) {
            if (keyframeNames.size > 0) {
              const parsedAnim = valueParser(decl.value);
              parsedAnim.walk((node) => {
                if (node.type === "word" && keyframeNames.has(node.value)) {
                  node.value = this.obfuscateName(node.value);
                }
              });
              decl.value = parsedAnim.toString();
            }
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
      .process(css, { from })
      .then((result) => result.css);
  }
}
