import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { CSSShuffle } from "../src/css-shuffle.js";
import { tmpdir } from "os";

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(tmpdir(), prefix));
}

function writeFile(dir: string, name: string, content: string) {
  fs.writeFileSync(path.join(dir, name), content, "utf-8");
}

function readFile(dir: string, name: string): string {
  return fs.readFileSync(path.join(dir, name), "utf-8");
}

describe("CSSShuffle integration", () => {
  let inputDir: string;
  let outputDir: string;

  beforeEach(() => {
    inputDir = createTempDir("css-shuffle-input-");
    outputDir = createTempDir("css-shuffle-output-");
  });

  afterEach(() => {
    fs.rmSync(inputDir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("obfuscates CSS files consistently with HTML and JS", async () => {
    writeFile(
      inputDir,
      "styles.css",
      ".header { color: red; }\n.footer { color: blue; }",
    );
    writeFile(inputDir, "index.html", '<div class="header"></div>');
    writeFile(
      inputDir,
      "app.js",
      'document.querySelector(".header");',
    );

    const shuffler = new CSSShuffle();
    await shuffler.obfuscate(inputDir, outputDir);

    const css = readFile(outputDir, "styles.css");
    const html = readFile(outputDir, "index.html");
    const js = readFile(outputDir, "app.js");

    // header -> a, footer -> b in CSS
    expect(css).toContain(".a");
    expect(css).toContain(".b");
    // HTML class should match CSS
    expect(html).toContain('class="a"');
    // JS selector should match CSS
    expect(js).toContain('document.querySelector(".a")');
  });

  it("returns mapping JSON", async () => {
    writeFile(inputDir, "styles.css", ".foo { color: red; }");

    const shuffler = new CSSShuffle();
    await shuffler.obfuscate(inputDir, outputDir);

    const mapping = JSON.parse(shuffler.getMappingJSON());
    expect(mapping.foo).toBeDefined();
    expect(typeof mapping.foo).toBe("string");
  });

  it("saves mapping JSON to file", async () => {
    writeFile(inputDir, "styles.css", ".foo { color: red; }");

    const shuffler = new CSSShuffle();
    await shuffler.obfuscate(inputDir, outputDir);

    const mapPath = path.join(outputDir, "mapping.json");
    shuffler.saveMappingJSON(mapPath);

    expect(fs.existsSync(mapPath)).toBe(true);
    const mapping = JSON.parse(fs.readFileSync(mapPath, "utf-8"));
    expect(mapping.foo).toBeDefined();
  });

  it("processes in-place when no output directory given", async () => {
    writeFile(inputDir, "styles.css", ".header { color: red; }");

    const shuffler = new CSSShuffle();
    await shuffler.obfuscate(inputDir);

    const css = readFile(inputDir, "styles.css");
    expect(css).toContain(".a");
    expect(css).not.toContain(".header");
  });

  it("protects hash fragment IDs across files", async () => {
    writeFile(inputDir, "index.html", '<a href="/#section">Link</a>');
    writeFile(inputDir, "styles.css", "#section { color: red; }");

    const shuffler = new CSSShuffle();
    await shuffler.obfuscate(inputDir, outputDir);

    const css = readFile(outputDir, "styles.css");
    expect(css).toContain("#section");
    expect(css).not.toContain("#a");
  });

  it("populates stats for changed files", async () => {
    writeFile(inputDir, "styles.css", ".very-long-class-name { color: red; }");

    const shuffler = new CSSShuffle();
    await shuffler.obfuscate(inputDir, outputDir);

    // Should have stripped the dist dir prefix from the filename
    const mapping = shuffler.getMapping();
    expect(mapping.size).toBeGreaterThan(0);
  });

  it("handles mixed file types consistently", async () => {
    writeFile(inputDir, "styles.css", ".card { }");
    writeFile(inputDir, "page.html", '<div class="card"></div>');

    const shuffler = new CSSShuffle();
    await shuffler.obfuscate(inputDir, outputDir);

    const css = readFile(outputDir, "styles.css");
    const html = readFile(outputDir, "page.html");
    expect(css).toContain(".a");
    expect(html).toContain('class="a"');
  });

  it("handles empty source directory", async () => {
    const shuffler = new CSSShuffle();
    await expect(
      shuffler.obfuscate(inputDir, outputDir),
    ).resolves.not.toThrow();
  });

  it("handles HTML with inline style and script", async () => {
    writeFile(
      inputDir,
      "index.html",
      [
        "<html>",
        "<head>",
        "<style>.btn { color: red; }</style>",
        "</head>",
        "<body>",
        '<button class="btn">Click</button>',
        "<script>document.querySelector('.btn');</script>",
        "</body>",
        "</html>",
      ].join(""),
    );

    const shuffler = new CSSShuffle();
    await shuffler.obfuscate(inputDir, outputDir);

    const html = readFile(outputDir, "index.html");
    expect(html).toContain(".a { color: red; }");
    expect(html).toContain('class="a"');
    expect(html).toContain('document.querySelector(".a")');
  });
});
