import { describe, it, expect, beforeEach } from "vitest";
import { HTMLObfuscator } from "../src/html-obfuscator.js";
import { Renamer } from "../src/renamer.js";
import { CSSObfuscator } from "../src/css-obfuscator.js";
import { JSObfuscator } from "../src/js-obfuscator.js";

describe("HTMLObfuscator", () => {
  let renamer: Renamer;
  let htmlObfuscator: HTMLObfuscator;

  beforeEach(() => {
    renamer = new Renamer();
    htmlObfuscator = new HTMLObfuscator(
      renamer,
      new CSSObfuscator(renamer),
      new JSObfuscator(renamer),
    );
  });

  it("obfuscates class attributes", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div class="foo bar"></div>',
    );
    expect(result).toContain('class="a b"');
  });

  it("obfuscates id attributes", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div id="my-id"></div>',
    );
    expect(result).toContain('id="a"');
  });

  it("obfuscates for attributes", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<label for="input-id">Name</label>',
    );
    expect(result).toContain('for="a"');
  });

  it("obfuscates aria-labelledby", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div aria-labelledby="label-id"></div>',
    );
    expect(result).toContain('aria-labelledby="a"');
  });

  it("obfuscates aria-describedby", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div aria-describedby="desc-id"></div>',
    );
    expect(result).toContain('aria-describedby="a"');
  });

  it("obfuscates aria-controls", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div aria-controls="panel-id"></div>',
    );
    expect(result).toContain('aria-controls="a"');
  });

  it("obfuscates aria-owns", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div aria-owns="child-id"></div>',
    );
    expect(result).toContain('aria-owns="a"');
  });

  it("obfuscates aria-activedescendant", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div aria-activedescendant="option-1"></div>',
    );
    expect(result).toContain('aria-activedescendant="a"');
  });

  it("obfuscates aria-details", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div aria-details="detail-id"></div>',
    );
    expect(result).toContain('aria-details="a"');
  });

  it("obfuscates aria-errormessage", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div aria-errormessage="err-id"></div>',
    );
    expect(result).toContain('aria-errormessage="a"');
  });

  it("obfuscates aria-flowto", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div aria-flowto="next-id"></div>',
    );
    expect(result).toContain('aria-flowto="a"');
  });

  it("handles space-separated ARIA ID refs", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<div aria-labelledby="label1 label2 label3"></div>',
    );
    expect(result).toContain('aria-labelledby="a b c"');
  });

  it("protects hash fragment names", async () => {
    await htmlObfuscator.searchForProtectedNames(
      '<a href="/#projects">Link</a>',
    );
    expect(renamer.protected.has("projects")).toBe(true);
  });

  it("protects hash fragments with path prefixes", async () => {
    await htmlObfuscator.searchForProtectedNames(
      '<a href="/page#section">Link</a>',
    );
    expect(renamer.protected.has("section")).toBe(true);
  });

  it("obfuscates inline <style> content", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<style>.my-class { color: red; }</style>',
    );
    expect(result).toContain(".a { color: red; }");
  });

  it("obfuscates inline <script> content", async () => {
    const { result } = await htmlObfuscator.processHtml(
      '<script>document.querySelector(".my-class");</script>',
    );
    expect(result).toContain('document.querySelector(".a")');
  });

  it("processes both style and script inline", async () => {
    const { result } = await htmlObfuscator.processHtml(
      [
        "<html>",
        "<head>",
        "<style>.foo { color: red; }</style>",
        "</head>",
        "<body>",
        '<div class="foo">Hello</div>',
        "<script>document.querySelector('.foo');</script>",
        "</body>",
        "</html>",
      ].join(""),
    );
    // CSS class foo -> a in inline style
    expect(result).toContain(".a { color: red; }");
    // HTML class foo -> a
    expect(result).toContain('class="a"');
    // JS querySelector('.foo') -> '.a'
    expect(result).toContain('document.querySelector(".a")');
  });

  it("returns original size for stats", async () => {
    const html = '<div class="foo"></div>';
    const { originalSize } = await htmlObfuscator.processHtml(html);
    expect(originalSize).toBe(html.length);
  });

  it("handles HTML with no identifiers", async () => {
    const html = "<div><span>Hello</span></div>";
    const { result } = await htmlObfuscator.processHtml(html);
    expect(result).toContain(html);
  });

  it("handles empty HTML", async () => {
    const { result } = await htmlObfuscator.processHtml("");
    expect(result).toBeDefined();
  });
});
