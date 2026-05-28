import { describe, it, expect } from "vitest";
import { JSObfuscator } from "../src/js-obfuscator.js";
import { Renamer } from "../src/renamer.js";

describe("JSObfuscator", () => {
  it("obfuscates classList.add()", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementById("x").classList.add("my-class");',
    );
    expect(result).toContain('.classList.add("a")');
  });

  it("obfuscates classList.remove()", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementById("x").classList.remove("my-class");',
    );
    expect(result).toContain('.classList.remove("a")');
  });

  it("obfuscates classList.toggle()", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementById("x").classList.toggle("my-class");',
    );
    expect(result).toContain('.classList.toggle("a")');
  });

  it("obfuscates classList.contains()", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementById("x").classList.contains("my-class");',
    );
    expect(result).toContain('.classList.contains("a")');
  });

  it("obfuscates classList.replace()", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementById("x").classList.replace("old-class", "new-class");',
    );
    expect(result).toContain('.classList.replace("a", "b")');
  });

  it("obfuscates querySelector with class selector", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.querySelector(".my-class");',
    );
    expect(result).toContain('document.querySelector(".a")');
  });

  it("obfuscates querySelector with ID selector", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.querySelector("#my-id");',
    );
    expect(result).toContain('document.querySelector("#a")');
  });

  it("obfuscates querySelectorAll", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.querySelectorAll(".my-class");',
    );
    expect(result).toContain('document.querySelectorAll(".a")');
  });

  it("obfuscates getElementById", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementById("my-id");',
    );
    expect(result).toContain('document.getElementById("a")');
  });

  it("obfuscates getElementsByClassName", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementsByClassName("my-class");',
    );
    expect(result).toContain('document.getElementsByClassName("a")');
  });

  it("obfuscates className assignment", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementById("x").className = "foo bar";',
    );
    expect(result).toContain('.className = "a b"');
  });

  it("obfuscates setAttribute('class', ...)", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementById("x").setAttribute("class", "my-class");',
    );
    expect(result).toContain('.setAttribute("class", "a")');
  });

  it("obfuscates setAttribute('id', ...)", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementById("x").setAttribute("id", "my-id");',
    );
    expect(result).toContain('.setAttribute("id", "a")');
  });

  it("traces DOM element through variable declarations", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const code = [
      "const el = document.getElementById('container');",
      "el.classList.add('my-class');",
    ].join("\n");
    const result = await obfuscator.obfuscate(code);
    expect(result).toContain('document.getElementById("a")');
    expect(result).toContain('.classList.add("b")');
  });

  it("traces DOM element through querySelector variable", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const code = [
      "const el = document.querySelector('.container');",
      "el.classList.add('my-class');",
    ].join("\n");
    const result = await obfuscator.obfuscate(code);
    expect(result).toContain('document.querySelector(".a")');
    expect(result).toContain('.classList.add("b")');
  });

  it("handles chained calls on querySelector result", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const code = [
      "document.querySelector('.foo').classList.add('bar');",
    ].join("\n");
    const result = await obfuscator.obfuscate(code);
    // Outer call (classList.add) is processed before inner (querySelector)
    expect(result).toContain('document.querySelector(".b").classList.add("a")');
  });

  it("traces DOM through forEach callback params", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const code = [
      "document.querySelectorAll('.item').forEach(el => {",
      "  el.classList.add('active');",
      "});",
    ].join("\n");
    const result = await obfuscator.obfuscate(code);
    expect(result).toContain('document.querySelectorAll(".a")');
    expect(result).toContain('.classList.add("b")');
  });

  it("traces DOM through .map() callback", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const code = [
      "const items = document.querySelectorAll('.item');",
      "items.map(el => el.classList.add('active'));",
    ].join("\n");
    const result = await obfuscator.obfuscate(code);
    expect(result).toContain('document.querySelectorAll(".a")');
    expect(result).toContain('.classList.add("b")');
  });

  it("leaves non-DOM calls unchanged", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const code = 'someRandomFunc(".my-class");';
    const result = await obfuscator.obfuscate(code);
    expect(result).toContain('".my-class"');
  });

  it("preserves code with no DOM references", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const code = "const x = 1 + 2; console.log(x);";
    const result = await obfuscator.obfuscate(code);
    // Generator may not preserve exact whitespace, check semantics instead
    expect(result).toContain("const x = 1 + 2");
    expect(result).toContain("console.log(x)");
  });

  it("handles template literals in querySelector", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      "document.querySelector(`.my-class`);",
    );
    expect(result).toContain("document.querySelector(`.a`)");
  });

  it("leaves dynamic template literals alone", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const code = "document.querySelector(`.container-${id}`);";
    const result = await obfuscator.obfuscate(code);
    expect(result).toContain("`.container-${id}`");
  });

  it("handles element.querySelector on a DOM variable", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const code = [
      "const parent = document.getElementById('wrapper');",
      "parent.querySelector('.child');",
    ].join("\n");
    const result = await obfuscator.obfuscate(code);
    expect(result).toContain('document.getElementById("a")');
    expect(result).toContain('parent.querySelector(".b")');
  });

  it("handles document.body.querySelector", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.body.querySelector(".my-class");',
    );
    expect(result).toContain('document.body.querySelector(".a")');
  });

  it("handles multiple classNames in className assignment", async () => {
    const obfuscator = new JSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      'document.getElementById("x").className = "foo bar baz";',
    );
    // AssignmentExpression processed before inner CallExpression
    expect(result).toContain('.className = "a b c"');
  });

  it("maintains consistent mapping across calls", async () => {
    const renamer = new Renamer();
    const obfuscator = new JSObfuscator(renamer);
    const code = [
      'const el = document.getElementById("container");',
      'el.classList.add("active");',
      'el.classList.remove("active");',
    ].join("\n");
    const result = await obfuscator.obfuscate(code);
    expect(result).toContain('getElementById("a")');
    expect(result).toContain('classList.add("b")');
    expect(result).toContain('classList.remove("b")');
  });
});
