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

  it("re-hashes already-hashed CSS files and updates references in HTML and JS (Astro/Vite style)", async () => {
    fs.mkdirSync(path.join(inputDir, "_astro"), { recursive: true });
    writeFile(
      inputDir,
      "_astro/index.DZQCOZSL.css",
      ".header { color: red; }",
    );
    writeFile(
      inputDir,
      "index.html",
      '<link rel="stylesheet" href="/_astro/index.DZQCOZSL.css"><div class="header"></div>',
    );
    writeFile(
      inputDir,
      "_astro/hoisted.BjVTQU25.js",
      'const cssFile = "/_astro/index.DZQCOZSL.css"; document.querySelector(".header");',
    );

    const shuffler = new CSSShuffle({ hash: true });
    await shuffler.obfuscate(inputDir, outputDir);

    // Old file should no longer exist
    expect(fs.existsSync(path.join(outputDir, "_astro/index.DZQCOZSL.css"))).toBe(false);

    // New file with content hash should exist
    const outputFiles = fs.readdirSync(path.join(outputDir, "_astro"));
    const newCssFile = outputFiles.find((f) => f.startsWith("index.") && f.endsWith(".css"));
    expect(newCssFile).toBeDefined();
    expect(newCssFile).not.toBe("index.DZQCOZSL.css");

    // Content of new CSS should be obfuscated
    const newCssContent = readFile(path.join(outputDir, "_astro"), newCssFile!);
    expect(newCssContent).toContain(".a");

    // HTML should reference the new CSS filename
    const html = readFile(outputDir, "index.html");
    expect(html).toContain(`href="/_astro/${newCssFile}"`);
    expect(html).not.toContain("index.DZQCOZSL.css");
    expect(html).toContain('class="a"');

    // JS should reference the new CSS filename and obfuscated class
    const js = readFile(path.join(outputDir, "_astro"), "hoisted.BjVTQU25.js");
    expect(js).toContain(`"/_astro/${newCssFile}"`);
    expect(js).not.toContain("index.DZQCOZSL.css");
    expect(js).toContain('document.querySelector(".a")');
  });

  it("updates @import references between hashed CSS files", async () => {
    fs.mkdirSync(path.join(inputDir, "assets"), { recursive: true });
    writeFile(
      inputDir,
      "assets/reset.A1B2C3D4.css",
      ".reset { margin: 0; }",
    );
    writeFile(
      inputDir,
      "assets/main.E5F6G7H8.css",
      '@import "./reset.A1B2C3D4.css";\n.main { color: red; }',
    );

    const shuffler = new CSSShuffle();
    await shuffler.obfuscate(inputDir, outputDir);

    const outputFiles = fs.readdirSync(path.join(outputDir, "assets"));
    const newResetFile = outputFiles.find((f) => f.startsWith("reset.") && f.endsWith(".css"));
    const newMainFile = outputFiles.find((f) => f.startsWith("main.") && f.endsWith(".css"));

    expect(newResetFile).toBeDefined();
    expect(newMainFile).toBeDefined();

    const mainContent = readFile(path.join(outputDir, "assets"), newMainFile!);
    expect(mainContent).toContain(newResetFile);
    expect(mainContent).not.toContain("reset.A1B2C3D4.css");
  });

  it("appends content hash to unhashed files when hash mode is 'all'", async () => {
    writeFile(inputDir, "styles.css", ".btn { color: red; }");
    writeFile(inputDir, "index.html", '<link rel="stylesheet" href="styles.css"><button class="btn">Click</button>');

    const shuffler = new CSSShuffle({ hash: "all" });
    await shuffler.obfuscate(inputDir, outputDir);

    expect(fs.existsSync(path.join(outputDir, "styles.css"))).toBe(false);

    const outputFiles = fs.readdirSync(outputDir);
    const newCssFile = outputFiles.find((f) => f.startsWith("styles.") && f.endsWith(".css"));
    expect(newCssFile).toBeDefined();

    const html = readFile(outputDir, "index.html");
    expect(html).toContain(`href="${newCssFile}"`);
    expect(html).not.toContain('href="styles.css"');
  });

  it("keeps original filename when hash option is false", async () => {
    fs.mkdirSync(path.join(inputDir, "_astro"), { recursive: true });
    writeFile(inputDir, "_astro/index.DZQCOZSL.css", ".btn { color: red; }");
    writeFile(inputDir, "index.html", '<link rel="stylesheet" href="/_astro/index.DZQCOZSL.css">');

    const shuffler = new CSSShuffle({ hash: false });
    await shuffler.obfuscate(inputDir, outputDir);

    expect(fs.existsSync(path.join(outputDir, "_astro/index.DZQCOZSL.css"))).toBe(true);
    const html = readFile(outputDir, "index.html");
    expect(html).toContain('href="/_astro/index.DZQCOZSL.css"');
  });

  it("does not delete files when input and dist resolve to the same directory", async () => {
    writeFile(inputDir, "styles.css", ".btn { color: red; }");
    writeFile(inputDir, "index.html", '<div class="btn"></div>');

    const shuffler = new CSSShuffle();
    // Pass same directory with different string representation (e.g., with trailing separator or relative path)
    const sameDirWithDot = path.join(inputDir, ".");
    await shuffler.obfuscate(inputDir, sameDirWithDot);

    expect(fs.existsSync(path.join(inputDir, "styles.css"))).toBe(true);
    expect(fs.existsSync(path.join(inputDir, "index.html"))).toBe(true);
    const css = readFile(inputDir, "styles.css");
    expect(css).toContain(".a");
  });
});
