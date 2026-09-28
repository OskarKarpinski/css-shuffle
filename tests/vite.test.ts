import { describe, it, expect } from "vitest";
import {
  cssShuffleVitePlugin,
  transformTemplateAttributes,
} from "../src/vite.js";
import { Renamer } from "../src/renamer.js";

describe("transformTemplateAttributes", () => {
  it("transforms class attributes in HTML strings", () => {
    const renamer = new Renamer();
    renamer.rename("btn"); // -> a
    renamer.rename("primary"); // -> b

    const input = '<div class="btn primary"><span>Text</span></div>';
    const output = transformTemplateAttributes(input, renamer);
    expect(output).toBe('<div class="a b"><span>Text</span></div>');
  });

  it("transforms id and for attributes", () => {
    const renamer = new Renamer();
    renamer.rename("username"); // -> a
    renamer.rename("submit-btn"); // -> b

    const input = '<label for="username">User</label><input id="username"><button id="submit-btn">Go</button>';
    const output = transformTemplateAttributes(input, renamer);
    expect(output).toBe('<label for="a">User</label><input id="a"><button id="b">Go</button>');
  });

  it("transforms ARIA ID references", () => {
    const renamer = new Renamer();
    renamer.rename("title-id"); // -> a
    renamer.rename("desc-id"); // -> b

    const input = '<div aria-labelledby="title-id" aria-describedby="desc-id">Dialog</div>';
    const output = transformTemplateAttributes(input, renamer);
    expect(output).toBe('<div aria-labelledby="a" aria-describedby="b">Dialog</div>');
  });

  it("transforms Astro addAttribute calls", () => {
    const renamer = new Renamer();
    renamer.rename("card"); // -> a
    renamer.rename("highlight"); // -> b
    renamer.rename("panel-id"); // -> c

    const input = 'renderTemplate`<div${addAttribute("card highlight", "class")}${addAttribute("panel-id", "id")}>Content</div>`';
    const output = transformTemplateAttributes(input, renamer);
    expect(output).toContain('addAttribute("a b", "class")');
    expect(output).toContain('addAttribute("c", "id")');
  });

  it("transforms SVG url references and use href", () => {
    const renamer = new Renamer();
    renamer.rename("grad-1"); // -> a
    renamer.rename("icon-star"); // -> b

    const input = '<rect fill="url(#grad-1)" /><use href="#icon-star" />';
    const output = transformTemplateAttributes(input, renamer);
    expect(output).toContain('fill="url(#a)"');
    expect(output).toContain('href="#b"');
  });
});

describe("cssShuffleVitePlugin", () => {
  it("has correct plugin metadata", () => {
    const plugin = cssShuffleVitePlugin();
    expect(plugin.name).toBe("css-shuffle");
    expect(plugin.enforce).toBe("pre");
  });

  it("transforms CSS files and records mappings", async () => {
    const plugin = cssShuffleVitePlugin();
    const cssCode = ".card { padding: 10px; } #main-header { color: red; }";

    const result = await (plugin.transform as any).call(
      {},
      cssCode,
      "/src/styles.css",
    );

    expect(result).toBeDefined();
    expect(result.code).toContain(".a { padding: 10px; }");
    expect(result.code).toContain("#b { color: red; }");
  });

  it("transforms virtual CSS from Astro components", async () => {
    const plugin = cssShuffleVitePlugin();
    const virtualCss = ".scoped-btn[data-astro-cid-xyz] { color: blue; }";

    const result = await (plugin.transform as any).call(
      {},
      virtualCss,
      "/src/pages/index.astro?astro&type=style&index=0&lang.css",
    );

    expect(result).toBeDefined();
    expect(result.code).toContain(".a[data-astro-cid-xyz] { color: blue; }");
  });

  it("skips files in node_modules", async () => {
    const plugin = cssShuffleVitePlugin();
    const cssCode = ".third-party { margin: 0; }";

    const result = await (plugin.transform as any).call(
      {},
      cssCode,
      "/node_modules/library/dist/style.css",
    );

    expect(result).toBeNull();
  });

  it("respects custom exclude patterns", async () => {
    const plugin = cssShuffleVitePlugin({
      exclude: ["custom-skip.css", /legacy/],
    });

    const res1 = await (plugin.transform as any).call(
      {},
      ".skip-me { color: red; }",
      "/src/custom-skip.css",
    );
    expect(res1).toBeNull();

    const res2 = await (plugin.transform as any).call(
      {},
      ".skip-me { color: red; }",
      "/src/legacy-styles.css",
    );
    expect(res2).toBeNull();
  });

  it("transforms DOM calls and templates in renderChunk", async () => {
    const plugin = cssShuffleVitePlugin();

    // 1. Transform CSS first
    await (plugin.transform as any).call(
      {},
      ".btn { color: red; } #modal { display: block; }",
      "/src/styles.css",
    );

    // 2. Render chunk with DOM queries and templates
    const chunkCode = [
      'const el = document.querySelector(".btn");',
      'const modal = document.getElementById("modal");',
      'const html = renderTemplate`<div id="modal" class="btn">Hello</div>`;',
    ].join("\n");

    const result = await (plugin.renderChunk as any).call(
      {},
      chunkCode,
      { fileName: "pages/index.js" },
    );

    expect(result).toBeDefined();
    expect(result.code).toContain('document.querySelector(".a")');
    expect(result.code).toContain('document.getElementById("b")');
    expect(result.code).toContain('id="b" class="a"');
  });

  it("transforms HTML entrypoints via transformIndexHtml", async () => {
    const plugin = cssShuffleVitePlugin();

    // Transform CSS
    await (plugin.transform as any).call(
      {},
      ".hero { font-size: 2rem; }",
      "/src/main.css",
    );

    const html = '<html><body><div class="hero">Welcome</div></body></html>';
    const transformedHtml = await (plugin.transformIndexHtml as any).call(
      {},
      html,
    );

    expect(transformedHtml).toContain('class="a"');
    expect(transformedHtml).not.toContain('class="hero"');
  });

  it("emits mapping.json asset in generateBundle", async () => {
    const plugin = cssShuffleVitePlugin();

    await (plugin.transform as any).call(
      {},
      ".box { width: 100px; }",
      "/src/styles.css",
    );

    let emittedFile: any = null;
    const mockContext = {
      emitFile(file: any) {
        emittedFile = file;
      },
    };

    await (plugin.generateBundle as any).call(mockContext, {}, {});

    expect(emittedFile).toBeDefined();
    expect(emittedFile.type).toBe("asset");
    expect(emittedFile.fileName).toBe("mapping.json");
    const parsed = JSON.parse(emittedFile.source);
    expect(parsed.box).toBe("a");
  });

  it("disables mapping file when mappingFile is false", async () => {
    const plugin = cssShuffleVitePlugin({ mappingFile: false });

    await (plugin.transform as any).call(
      {},
      ".box { width: 100px; }",
      "/src/styles.css",
    );

    let emittedFile: any = null;
    const mockContext = {
      emitFile(file: any) {
        emittedFile = file;
      },
    };

    await (plugin.generateBundle as any).call(mockContext, {}, {});
    expect(emittedFile).toBeNull();
  });

  it("respects safelist configuration", async () => {
    const plugin = cssShuffleVitePlugin({
      safelist: ["keep-me", /^preserve-/],
    });

    const cssCode = ".keep-me { color: red; } .preserve-this { color: blue; } .rename-me { color: green; }";
    const result = await (plugin.transform as any).call({}, cssCode, "/src/styles.css");

    expect(result.code).toContain(".keep-me");
    expect(result.code).toContain(".preserve-this");
    expect(result.code).toContain(".a");
  });
});
