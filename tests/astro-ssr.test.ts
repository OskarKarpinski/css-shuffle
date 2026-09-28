import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { build } from "astro";
import fs from "fs";
import path from "path";
import os from "os";

import cssShuffleIntegration from "../src/astro.js";

describe("Astro SSR and Static Integration", () => {
  let tmp: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "astro-ssr-spec-"));
    fs.writeFileSync(
      path.join(tmp, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    fs.symlinkSync(
      path.resolve("node_modules"),
      path.join(tmp, "node_modules"),
      "dir",
    );
    fs.mkdirSync(path.join(tmp, ".astro"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "src/pages"), { recursive: true });
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function dummyAdapter() {
    return {
      name: "dummy-adapter",
      hooks: {
        "astro:config:done": ({ setAdapter }: any) => {
          setAdapter({
            name: "dummy-adapter",
            serverEntrypoint: "astro/app/node",
            supportedAstroFeatures: {
              serverOutput: "stable",
              sharpImageService: "stable",
            },
          });
        },
      },
    };
  }

  it("obfuscates classes synchronously in Astro SSR mode (output: 'server')", async () => {
    fs.writeFileSync(
      path.join(tmp, "src/styles.css"),
      ".card { padding: 20px; } .btn { color: red; }",
    );
    fs.writeFileSync(
      path.join(tmp, "src/pages/index.astro"),
      `---
import "../styles.css";
---
<html>
  <head>
    <style>
      .scoped-title { font-size: 2rem; }
    </style>
  </head>
  <body>
    <h1 class="scoped-title">Title</h1>
    <div class="card"><button class="btn">Click</button></div>
  </body>
</html>
`,
    );

    await build({
      root: tmp,
      output: "server",
      configFile: false,
      adapter: dummyAdapter() as any,
      integrations: [cssShuffleIntegration()],
      logLevel: "error",
    });

    // 1. Verify mapping file was emitted
    const mappingPath = path.join(tmp, "dist/mapping.json");
    expect(fs.existsSync(mappingPath)).toBe(true);
    const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));
    expect(mapping["card"]).toBeDefined();
    expect(mapping["btn"]).toBeDefined();
    expect(mapping["scoped-title"]).toBeDefined();

    // 2. Verify server files have obfuscated class names and styles
    const serverFiles = (fs.readdirSync(path.join(tmp, "dist/server"), { recursive: true }) as string[])
      .filter((f) => f.endsWith(".mjs"));
    const allServerContent = serverFiles
      .map((f) => fs.readFileSync(path.join(tmp, "dist/server", f), "utf-8"))
      .join("\n");

    expect(allServerContent).toContain(`class="${mapping["scoped-title"]}"`);
    expect(allServerContent).toContain(`class="${mapping["card"]}"`);
    expect(allServerContent).toContain(`class="${mapping["btn"]}"`);

    // 3. Verify server styles contain the exact matching obfuscated classes
    expect(allServerContent).toContain(`.${mapping["scoped-title"]}[data-astro-cid-`);
    expect(allServerContent).toContain(`.${mapping["card"]}`);
    expect(allServerContent).toContain(`.${mapping["btn"]}`);
  });

  it("obfuscates classes in Astro Static mode (output: 'static')", async () => {
    fs.writeFileSync(
      path.join(tmp, "src/styles.css"),
      ".banner { background: yellow; }",
    );
    fs.writeFileSync(
      path.join(tmp, "src/pages/index.astro"),
      `---
import "../styles.css";
---
<html>
  <head></head>
  <body>
    <div class="banner">Announcement</div>
  </body>
</html>
`,
    );

    await build({
      root: tmp,
      output: "static",
      configFile: false,
      integrations: [cssShuffleIntegration()],
      logLevel: "error",
    });

    const htmlPath = path.join(tmp, "dist/index.html");
    expect(fs.existsSync(htmlPath)).toBe(true);
    const html = fs.readFileSync(htmlPath, "utf-8");

    const mappingPath = path.join(tmp, "dist/mapping.json");
    expect(fs.existsSync(mappingPath)).toBe(true);
    const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));

    expect(html).toContain(`class="${mapping.banner}"`);
    expect(html).not.toContain('class="banner"');
    expect(html).toContain(`.${mapping.banner}{`);
  });
});
