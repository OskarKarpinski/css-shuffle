import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import selectorParser from "postcss-selector-parser";

import { Renamer } from "./renamer.js";
import { debugReplace } from "./logger.js";

/** Built-in DOM methods that return element references. */
const DOM_ELEMENT_SOURCES = new Set([
  "getElementById",
  "getElementsByClassName",
  "getElementsByTagName",
  "getElementsByName",
  "querySelector",
  "querySelectorAll",
  "createElement",
  "createElementNS",
  "closest",
  "parentElement",
  "firstElementChild",
  "lastElementChild",
  "nextElementSibling",
  "previousElementSibling",
]);

/** Properties on DOM elements that return child or document references. */
const DOM_ELEMENT_PROPERTIES = new Set([
  "parentElement",
  "firstElementChild",
  "lastElementChild",
  "nextElementSibling",
  "previousElementSibling",
  "ownerDocument",
  "body",
  "head",
  "documentElement",
]);

export class JSObfuscator {
  constructor(private renamer: Renamer) {}

  private getObfuscateName(key: string): string {
    return this.renamer.rename(key);
  }

  /**
   * Parse JavaScript source and obfuscate all CSS class/ID references
   * in DOM API calls and property assignments.
   */
  async obfuscate(js: string): Promise<string> {
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
          this.isDomElement(object.object, path.scope)
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
          this.isDomElement(object, path.scope)
        ) {
          const val = getStringValue(args[0]);
          if (val !== null) {
            const obf = this.obfuscateSelector(val);
            args[0] = createStringNode(args[0], obf);
          }
        }

        /**
         * Handle getElementById calls. Obfuscates the ID argument.
         */
        if (
          method.name === "getElementById" &&
          args.length === 1 &&
          this.isDomElement(object, path.scope)
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
          this.isDomElement(object, path.scope)
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
          this.isDomElement(object, path.scope)
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
          this.isDomElement(left.object, path.scope)
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
   * Obfuscate class and ID references inside a CSS selector string.
   */
  private obfuscateSelector(selector: string): string {
    const obfuscated = selectorParser((selectors) => {
      selectors.walkClasses((node) => {
        const obf = this.getObfuscateName(node.value);
        if (obf) {
          debugReplace("JS", "querySelector", "class", node.value, obf);
          node.value = obf;
        }
      });
      selectors.walkIds((node) => {
        const obf = this.getObfuscateName(node.value);
        if (obf) {
          debugReplace("JS", "querySelector", "id", node.value, obf);
          node.value = obf;
        }
      });
    }).processSync(selector);

    return obfuscated;
  }

  /**
   * Check whether a Babel AST node is guaranteed to resolve to a DOM element.
   *
   * Handles call expressions (document.getElementById, element.querySelector),
   * member expressions (document.body), and identifiers by tracing variable
   * bindings and function callback parameters (NodeList.forEach, etc.).
   */
  private isDomElement(node: t.Node, scope: any): boolean {
    // document.getElementById(...) / document.querySelector(...) inline
    if (t.isCallExpression(node)) {
      const callee = node.callee;
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
        // document.X() or element.X()
        if (DOM_ELEMENT_SOURCES.has(callee.property.name)) {
          return true;
        }
      }
      return false;
    }

    // document.body / document.head / document.documentElement
    if (t.isMemberExpression(node)) {
      if (
        t.isIdentifier(node.property) &&
        DOM_ELEMENT_PROPERTIES.has(node.property.name)
      ) {
        return true;
      }
      return false;
    }

    // Identifier — look up what it was assigned from
    if (t.isIdentifier(node)) {
      // Well-known globals
      if (["document", "window", "HTMLElement"].includes(node.name)) {
        return true;
      }

      const binding = scope.getBinding(node.name);
      if (!binding) return false;

      const bindingPath = binding.path;

      // const el = document.querySelector(...)
      // const el = someEl.closest(...)
      if (t.isVariableDeclarator(bindingPath.node) && bindingPath.node.init) {
        return this.isDomElement(bindingPath.node.init, bindingPath.scope);
      }

      // function param: forEach(link => link.addEventListener...)
      // treat params of callbacks whose parent array is DOM-sourced
      if (bindingPath.node.type === "Identifier" && bindingPath.parentPath) {
        const parent = bindingPath.parentPath.node;

        // Arrow/function param in .forEach/.map etc on a DOM NodeList/array
        if (
          t.isArrowFunctionExpression(parent) ||
          t.isFunctionExpression(parent)
        ) {
          const callPath = bindingPath.parentPath.parentPath;
          if (
            callPath &&
            t.isCallExpression(callPath.node) &&
            t.isMemberExpression(callPath.node.callee) &&
            t.isIdentifier(
              (callPath.node.callee as t.MemberExpression).property,
            ) &&
            ["forEach", "map", "filter", "find"].includes(
              (
                (callPath.node.callee as t.MemberExpression)
                  .property as t.Identifier
              ).name,
            )
          ) {
            // Check if the array/NodeList being iterated is DOM-sourced
            return this.isDomElement(
              callPath.node.callee.object,
              callPath.scope,
            );
          }
        }
      }
    }

    return false;
  }
}
