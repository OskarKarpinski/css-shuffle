import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import cssShuffleIntegration from "../src/astro.js";

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(tmpdir(), prefix));
}

describe("Astro integration", () => {
  let tempDir: string;
  let distDir: string;

  beforeEach(() => {
    tempDir = createTempDir("astro-integration-test-");
    distDir = path.join(tempDir, "dist");
    fs.mkdirSync(distDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("re-hashes CSS and creates mapping.json in astro:build:done hook", async () => {
    const astroDir = path.join(distDir, "_astro");
    fs.mkdirSync(astroDir, { recursive: true });

    fs.writeFileSync(
      path.join(astroDir, "index.DZQCOZSL.css"),
      ".card { padding: 10px; }",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(distDir, "index.html"),
      '<html><head><link rel="stylesheet" href="/_astro/index.DZQCOZSL.css"></head><body><div class="card">Hello</div></body></html>',
      "utf-8",
    );

    const integration = cssShuffleIntegration();
    expect(integration.name).toBe("css-shuffle");

    // Call astro:build:done hook
    const buildDoneHook = integration.hooks?.["astro:build:done"] as any;
    expect(buildDoneHook).toBeDefined();

    const dirUrl = new URL(`file://${distDir}/`);
    await buildDoneHook({ dir: dirUrl });

    // Old CSS file should be removed
    expect(fs.existsSync(path.join(astroDir, "index.DZQCOZSL.css"))).toBe(false);

    // New CSS file should exist with content hash
    const files = fs.readdirSync(astroDir);
    const newCss = files.find((f) => f.startsWith("index.") && f.endsWith(".css"));
    expect(newCss).toBeDefined();
    expect(newCss).not.toBe("index.DZQCOZSL.css");

    // HTML should reference new CSS file
    const html = fs.readFileSync(path.join(distDir, "index.html"), "utf-8");
    expect(html).toContain(`href="/_astro/${newCss}"`);
    expect(html).toContain('class="a"');

    // mapping.json should be saved in parent of dist
    const mappingFile = path.join(tempDir, "mapping.json");
    expect(fs.existsSync(mappingFile)).toBe(true);
    const mapping = JSON.parse(fs.readFileSync(mappingFile, "utf-8"));
    expect(mapping.card).toBe("a");
  });

  it("disables mapping file when mappingFile is false", async () => {
    fs.writeFileSync(
      path.join(distDir, "index.html"),
      '<div class="box"></div>',
      "utf-8",
    );

    const integration = cssShuffleIntegration({ mappingFile: false });
    const buildDoneHook = integration.hooks?.["astro:build:done"] as any;

    const dirUrl = new URL(`file://${distDir}/`);
    await buildDoneHook({ dir: dirUrl });

    const mappingFile = path.join(tempDir, "mapping.json");
    expect(fs.existsSync(mappingFile)).toBe(false);
  });
});
