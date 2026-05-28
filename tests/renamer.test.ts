import { describe, it, expect } from "vitest";
import { Renamer } from "../src/renamer.js";

describe("Renamer", () => {
  it("generates sequential short names starting from a", () => {
    const renamer = new Renamer();
    expect(renamer.rename("foo")).toBe("a");
    expect(renamer.rename("bar")).toBe("b");
    expect(renamer.rename("baz")).toBe("c");
  });

  it("returns consistent names for the same key", () => {
    const renamer = new Renamer();
    expect(renamer.rename("foo")).toBe("a");
    expect(renamer.rename("bar")).toBe("b");
    expect(renamer.rename("foo")).toBe("a");
  });

  it("preserves protected names in rename()", () => {
    const renamer = new Renamer();
    renamer.protect("keep-me");
    expect(renamer.rename("keep-me")).toBe("keep-me");
  });

  it("preserves protected names in get()", () => {
    const renamer = new Renamer();
    renamer.protect("keep-me");
    expect(renamer.get("keep-me")).toBe("keep-me");
  });

  it("skips protected names when allocating indices", () => {
    const renamer = new Renamer();
    renamer.protect("skip");
    expect(renamer.rename("skip")).toBe("skip");
    expect(renamer.rename("first")).toBe("a");
  });

  it("cycles through all 52 single-char names before multi-char", () => {
    const renamer = new Renamer();
    const names = new Set<string>();
    for (let i = 0; i < 52; i++) {
      names.add(renamer.rename(`key-${i}`));
    }
    expect(names.size).toBe(52);
    expect(renamer.rename("next")).toBe("aa");
  });

  it("get() returns original name if not mapped", () => {
    const renamer = new Renamer();
    expect(renamer.get("unmapped")).toBe("unmapped");
  });

  it("get() returns mapped name if mapped", () => {
    const renamer = new Renamer();
    renamer.rename("foo");
    expect(renamer.get("foo")).toBe("a");
  });

  it("protect deduplicates", () => {
    const renamer = new Renamer();
    renamer.protect("name");
    renamer.protect("name");
    expect(renamer.protected.size).toBe(1);
  });

  it("handles many names without collision", () => {
    const renamer = new Renamer();
    const generated = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const name = renamer.rename(`key-${i}`);
      expect(generated.has(name)).toBe(false);
      generated.add(name);
    }
    expect(generated.size).toBe(1000);
  });
});
