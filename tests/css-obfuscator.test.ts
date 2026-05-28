import { describe, it, expect } from "vitest";
import { CSSObfuscator } from "../src/css-obfuscator.js";
import { Renamer } from "../src/renamer.js";

describe("CSSObfuscator", () => {
  it("obfuscates class selectors", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(".my-class { color: red; }");
    expect(result).toBe(".a { color: red; }");
  });

  it("obfuscates ID selectors", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate("#my-id { color: red; }");
    expect(result).toBe("#a { color: red; }");
  });

  it("obfuscates custom property declarations", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(":root { --primary-color: blue; }");
    expect(result).toBe(":root { --a: blue; }");
  });

  it("obfuscates var() references", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      ".x { color: var(--primary-color); }",
    );
    expect(result).toBe(".a { color: var(--b); }");
  });

  it("obfuscates var() with fallback values", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      ".x { color: var(--primary-color, red); }",
    );
    expect(result).toBe(".a { color: var(--b, red); }");
  });

  it("obfuscates @property at-rule names", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      "@property --my-prop { syntax: \"*\"; inherits: false; }",
    );
    expect(result).toBe("@property --a { syntax: \"*\"; inherits: false; }");
  });

  it("handles multiple selectors in a rule", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(".class1, .class2 { color: red; }");
    expect(result).toBe(".a, .b { color: red; }");
  });

  it("handles compound selectors", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate("div.my-class#my-id { color: red; }");
    expect(result).toBe("div.a#b { color: red; }");
  });

  it("maintains consistent mapping across rules", async () => {
    const renamer = new Renamer();
    const obfuscator = new CSSObfuscator(renamer);
    const css = [
      ".shared { color: red; }",
      ".other { color: blue; }",
      ".shared { font-size: 14px; }",
    ].join("\n");
    const result = await obfuscator.obfuscate(css);
    expect(result).toBe(".a { color: red; }\n.b { color: blue; }\n.a { font-size: 14px; }");
  });

  it("handles empty CSS", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate("");
    expect(result).toBe("");
  });

  it("leaves CSS with no identifiers unchanged", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const css = "div { color: red; }";
    const result = await obfuscator.obfuscate(css);
    expect(result).toBe(css);
  });

  it("handles attribute selectors without side effects", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate("[data-type=\"test\"] { color: red; }");
    expect(result).toBe("[data-type=\"test\"] { color: red; }");
  });

  it("handles pseudo-classes and pseudo-elements", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(".my-class:hover { color: red; }");
    expect(result).toBe(".a:hover { color: red; }");
  });

  it("obfuscates classes inside :not()", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(":not(.my-class) { color: red; }");
    expect(result).toBe(":not(.a) { color: red; }");
  });

  it("obfuscates var() with fallback values", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      ".x { color: var(--primary-color, red); }",
    );
    expect(result).toBe(".a { color: var(--b, red); }");
  });

  it("processes multiple rules", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const css = [
      ".foo { color: red; }",
      "#bar { color: blue; }",
      ":root { --baz: green; }",
      ".qux { color: var(--baz); }",
    ].join("\n");
    const result = await obfuscator.obfuscate(css);
    expect(result).toBe(
      ".a { color: red; }\n#b { color: blue; }\n:root { --d: green; }\n.c { color: var(--d); }",
    );
  });

  it("handles @media queries with class selectors inside", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      "@media (max-width: 768px) { .my-class { color: red; } }",
    );
    expect(result).toBe("@media (max-width: 768px) { .a { color: red; } }");
  });

  it("handles keyframe selectors correctly", async () => {
    const obfuscator = new CSSObfuscator(new Renamer());
    const result = await obfuscator.obfuscate(
      "@keyframes slide { from { left: 0; } to { left: 100px; } }",
    );
    expect(result).toBe("@keyframes slide { from { left: 0; } to { left: 100px; } }");
  });
});
