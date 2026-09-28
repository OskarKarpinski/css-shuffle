import { describe, it, expect } from "vitest";
import { computeHash, getNewHashedFilename } from "../src/hasher.js";

describe("hasher utility", () => {
  describe("computeHash", () => {
    it("computes deterministic 8-character sha256 hex hash", () => {
      const hash1 = computeHash(".a { color: red; }");
      const hash2 = computeHash(".a { color: red; }");
      const hash3 = computeHash(".b { color: blue; }");

      expect(hash1).toHaveLength(8);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    it("respects custom hash length", () => {
      const hash = computeHash(".test", 12);
      expect(hash).toHaveLength(12);
    });
  });

  describe("getNewHashedFilename", () => {
    it("replaces existing hash in Astro / Vite style filenames with dot separator", () => {
      const result = getNewHashedFilename("index.DZQCOZSL.css", "12345678", true);
      expect(result).toBe("index.12345678.css");
    });

    it("replaces existing hash with hyphen separator", () => {
      const result = getNewHashedFilename("chunk-CrMtAxWr.css", "abcdef12", true);
      expect(result).toBe("chunk-abcdef12.css");
    });

    it("replaces existing hash preserving .min.css suffix", () => {
      const result = getNewHashedFilename("vendor.A1B2C3D4.min.css", "newhash1", true);
      expect(result).toBe("vendor.newhash1.min.css");
    });

    it("does not re-hash unhashed files when hash mode is true (default)", () => {
      expect(getNewHashedFilename("styles.css", "12345678", true)).toBeNull();
      expect(getNewHashedFilename("main.css", "12345678", true)).toBeNull();
      expect(getNewHashedFilename("custom.min.css", "12345678", true)).toBeNull();
      expect(getNewHashedFilename("styles.module.css", "12345678", true)).toBeNull();
    });

    it("re-hashes unhashed files when hash mode is 'all'", () => {
      expect(getNewHashedFilename("styles.css", "12345678", "all")).toBe("styles.12345678.css");
      expect(getNewHashedFilename("custom.min.css", "12345678", "all")).toBe("custom.12345678.min.css");
    });

    it("returns null when hash mode is false", () => {
      expect(getNewHashedFilename("index.DZQCOZSL.css", "12345678", false)).toBeNull();
      expect(getNewHashedFilename("styles.css", "12345678", false)).toBeNull();
    });
  });
});
