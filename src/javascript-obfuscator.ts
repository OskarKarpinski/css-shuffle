import * as t from "@babel/types";

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

/**
 * Check whether a Babel AST node is guaranteed to resolve to a DOM element.
 *
 * Handles call expressions (document.getElementById, element.querySelector),
 * member expressions (document.body), and identifiers by tracing variable
 * bindings and function callback parameters (NodeList.forEach, etc.).
 */
export function isDomElement(node: t.Node, scope: any): boolean {
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
      return isDomElement(bindingPath.node.init, bindingPath.scope);
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
          return isDomElement(callPath.node.callee.object, callPath.scope);
        }
      }
    }
  }

  return false;
}
