import fs from "fs";
import { globby } from "globby";
import * as cheerio from "cheerio";
import { Table } from "console-table-printer";
import prettyBytes from "pretty-bytes";
import postcss, { Root } from "postcss";
import selectorParser from "postcss-selector-parser";
import valueParser from "postcss-value-parser";
import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = (_traverse).default;
import _generate from '@babel/generator';
const generate = (_generate).default;

import * as t from '@babel/types';

import { Renamer } from "./renamer.js";
import { isDomElement } from "./javascript-obfuscator.js";

export class CSSShuffle {
    private renamer = new Renamer();

    private readonly stats = new Map<string, {orginalSize: number, newSize: number}>()

    private obfuscateName(originalName: string): string {
        return this.renamer.rename(originalName);
    }

    private getObfuscateName(key: string): string {
        return this.renamer.get(key)
    }

    getMapping(): Map<string, string> {
        return this.renamer.renames;
    }

    getMappingJSON(): string {
        return JSON.stringify(Object.fromEntries(this.getMapping()), null, 2);
    }

    saveMappingJSON(path: string) {
        const mapping = this.getMappingJSON()

        fs.writeFileSync(path, mapping)
    }

    async obfuscateJS(js: string): Promise<string> {
        const ast = parser.parse(js, {
            sourceType: 'script',
            plugins: ['classProperties'],
            errorRecovery: true,
        });

        const getStringValue = (node: t.Node): string | null => {
            if (t.isStringLiteral(node)) return node.value;
            if (t.isTemplateLiteral(node) && node.quasis.length === 1 && node.expressions.length === 0) {
                return node.quasis[0].value.cooked || node.quasis[0].value.raw;
            }
            return null;
        };

        const createStringNode = (originalNode: t.Node, value: string): t.StringLiteral | t.TemplateLiteral => {
            if (t.isTemplateLiteral(originalNode)) {
                return t.templateLiteral([t.templateElement({ raw: value, cooked: value }, true)], []);
            }
            return t.stringLiteral(value);
        };

        traverse(ast, {
            CallExpression: (path) => {
                const { callee, arguments: args } = path.node;

                if (!t.isMemberExpression(callee)) return;
                const object = callee.object;
                const method = callee.property;

                if (!t.isIdentifier(method)) return;

                // ── classList.add/remove/toggle/contains/replace ──────────────────
                if (
                    t.isMemberExpression(object) &&
                    t.isIdentifier(object.property, { name: 'classList' }) &&
                    ['add', 'remove', 'toggle', 'contains', 'replace'].includes(method.name) &&
                    isDomElement(object.object, path.scope)   // ← guard
                ) {
                    args.forEach((arg, i) => {
                        const val = getStringValue(arg);
                        if (val !== null) {
                            const obf = this.getObfuscateName(val);
                            if (obf) args[i] = createStringNode(arg, obf);
                        }
                    });
                }

                // ── querySelector / querySelectorAll ──────────────────────────────
                if (
                    ['querySelector', 'querySelectorAll'].includes(method.name) &&
                    args.length === 1 &&
                    isDomElement(object, path.scope)          // ← guard
                ) {
                    const val = getStringValue(args[0]);
                    if (val !== null) {
                        args[0] = createStringNode(args[0], this.obfuscateSelector(val));
                    }
                }

                // ── getElementById ────────────────────────────────────────────────
                if (
                    method.name === 'getElementById' &&
                    args.length === 1 &&
                    isDomElement(object, path.scope)          // ← guard
                ) {
                    const val = getStringValue(args[0]);
                    if (val !== null) {
                        const obf = this.getObfuscateName(val);
                        if (obf) args[0] = createStringNode(args[0], obf);
                    }
                }

                // ── getElementsByClassName ────────────────────────────────────────
                if (
                    method.name === 'getElementsByClassName' &&
                    args.length === 1 &&
                    isDomElement(object, path.scope)          // ← guard
                ) {
                    const val = getStringValue(args[0]);
                    if (val !== null) {
                        const obf = this.getObfuscateName(val);
                        if (obf) args[0] = createStringNode(args[0], obf);
                    }
                }

                // ── setAttribute('class'/'id', ...) ───────────────────────────────
                if (
                    method.name === 'setAttribute' &&
                    args.length === 2 &&
                    isDomElement(object, path.scope)          // ← guard
                ) {
                    const attrName = getStringValue(args[0]);
                    const attrVal = getStringValue(args[1]);
                    if (attrName !== null && attrVal !== null) {
                        if (attrName === 'class') {
                            const newVal = attrVal
                                .split(/\s+/)
                                .map(cls => this.getObfuscateName(cls) || cls)
                                .join(' ');
                            args[1] = createStringNode(args[1], newVal);
                        } else if (attrName === 'id') {
                            const obf = this.getObfuscateName(attrVal);
                            if (obf) args[1] = createStringNode(args[1], obf);
                        }
                    }
                }
            },

            // ── element.className = 'foo bar' ─────────────────────────────────────
            AssignmentExpression: (path) => {
                const { left, right } = path.node;
                if (
                    t.isMemberExpression(left) &&
                    t.isIdentifier(left.property, { name: 'className' }) &&
                    isDomElement(left.object, path.scope)     // ← guard
                ) {
                    const val = getStringValue(right);
                    if (val !== null) {
                        const newVal = val
                            .split(/\s+/)
                            .map(cls => this.getObfuscateName(cls) || cls)
                            .join(' ');
                        path.node.right = createStringNode(right, newVal);
                    }
                }
            },
        });

        return generate(ast, { retainLines: true }, js).code;
    }

    async obfuscateCSS(css: string): Promise<string> {
        return await postcss([
            (root: Root) => {
                root.walkRules(rule => {
                    rule.selector = selectorParser(selectors => {
                        selectors.walkClasses(node => { node.value = this.obfuscateName(node.value) });
                        selectors.walkIds(node => { node.value = this.obfuscateName(node.value) });
                        }).processSync(rule.selector);
                    });

                    root.walkDecls(decl => {
                        if (decl.prop.startsWith("--")) {
                            decl.prop = `--${this.obfuscateName(decl.prop.substring(2))}`
                        }

                        const parsedValue = valueParser(decl.value);
                        parsedValue.walk(node => {
                        if (node.type === 'function' && node.value === 'var' && node.nodes[0]) {
                            node.nodes[0].value = `--${this.obfuscateName(node.nodes[0].value.substring(2))}`;
                        }
                        });
                        decl.value = parsedValue.toString();
                    })
                }
            ]).process(css, { from: undefined }).then(result => result.css);
    }

    private async obfuscateCSSInHtml(html: string): Promise<string> {
        const $ = cheerio.load(html);
        const styles = $('style').toArray();
        for (const style of styles) {
            const $style = $(style);
            const content = $style.html();
            if (content) {
                const obfuscatedContent = await this.obfuscateCSS(content);
                $style.html(obfuscatedContent);
            }
        }
        return $.html();
    }

    // Reuse your existing CSS selector obfuscation logic
    private obfuscateSelector(selector: string): string {
        return selector
            .replace(/\.([a-zA-Z0-9_-]+)/g, (_, cls) => {
                const obf = this.getObfuscateName(cls);
                return obf ? `.${obf}` : `.${cls}`;
            })
            .replace(/#([a-zA-Z0-9_-]+)/g, (_, id) => {
                const obf = this.getObfuscateName(id);
                return obf ? `#${obf}` : `#${id}`;
            });
    }

    private async replaceNamesInHtml(html: string): Promise<string> {
        const $ = cheerio.load(html);

        $('[class]').each((_, e) => {
            const classes = $(e).attr('class').split(/\s+/).filter(Boolean);
            const newClasses = classes.map(cls => this.getObfuscateName(cls) || cls);
            $(e).attr('class', newClasses.join(' '));
        })

        $('[id]').each((_, e) => {
            const id = $(e).attr('id');
            $(e).attr('id', this.getObfuscateName(id));
        })

        $('[for]').each((_, e) => {
            const id = $(e).attr('for');
            $(e).attr('for', this.getObfuscateName(id));
        })

        $('a[href^="#"]').each((_, e) => {
            const href = $(e).attr('href');
            const target = href.slice(1);
            $(e).attr('href', '#' + this.getObfuscateName(target));
        });

        const scripts = $('script').toArray();
        for (const script of scripts) {
            const $script = $(script);
            const content = $script.html();
            if (content) {
                const obfuscatedContent = await this.obfuscateJS(content);
                $script.html(obfuscatedContent);
            }
        }

        return $.html();
    }

    async obfuscate(input: string, dist?: string) {
        if (dist == undefined) {
            dist = input
        }

        if (input != dist) {
            // copy files from input dir to output dir
            if (fs.existsSync(dist)) {
                fs.rmSync(dist, { recursive: true, force: true });
            }
            fs.mkdirSync(dist, { recursive: true });
            fs.cpSync(input, dist, { recursive: true });
        }

        const htmlFiles = await globby(['**/*.html'], { cwd: dist, absolute: true });
        const cssFiles = await globby(['**/*.css'], { cwd: dist, absolute: true });

        // Obfuscate CSS files
        for (const cssFile of cssFiles) {
            const cssContent = fs.readFileSync(cssFile, 'utf-8');
            const obfuscatedCss = await this.obfuscateCSS(cssContent);
            fs.writeFileSync(cssFile, obfuscatedCss, 'utf-8');

            const oldSize = cssContent.length
            const newSize = obfuscatedCss.length
            if (oldSize != newSize) {
                const fileName = cssFile.replace(dist, '');
                this.stats.set(fileName, {
                    orginalSize: oldSize,
                    newSize: newSize
                })
            }
        }

        // Obfuscate CSS in <style> tag in HTML files
        for (const htmlFile of htmlFiles) {
            const htmlContent = fs.readFileSync(htmlFile, 'utf-8');
            let obfuscatedHtmlContent = await this.obfuscateCSSInHtml(htmlContent);
            fs.writeFileSync(htmlFile, obfuscatedHtmlContent, 'utf-8');

            const oldSize = htmlContent.length
            const newSize = obfuscatedHtmlContent.length
            if (oldSize != newSize) {
                const fileName = htmlFile.replace(dist, '');
                this.stats.set(fileName, {
                    orginalSize: oldSize,
                    newSize: newSize
                })
            }
        }

        // Export export obfuscated names to HTML
        for (const htmlFile of htmlFiles) {
            const htmlContent = fs.readFileSync(htmlFile, 'utf-8');
            let newHtmlContent = await this.replaceNamesInHtml(htmlContent);
            fs.writeFileSync(htmlFile, newHtmlContent, 'utf-8');

            let orginalSize = htmlContent.length
            const newSize = newHtmlContent.length
            if (orginalSize != newSize) {
                const fileName = htmlFile.replace(dist, '');

                // this file maybe already obfuscated so get the really orginal file size
                const fileStats = this.stats.get(fileName)
                if (fileStats != undefined) orginalSize = fileStats.orginalSize

                this.stats.set(fileName, {
                    orginalSize: orginalSize,
                    newSize: newSize
                })
            }
        }
    }

    printStatsTable() {
        const table = new Table();

        this.stats.forEach((stats, file) => {
            table.addRow({
                File: file,
                'Original Size': prettyBytes(stats.orginalSize),
                'New Size': prettyBytes(stats.newSize),
                Reduced: `${(((stats.orginalSize - stats.newSize) / stats.orginalSize) * 100) | 0}%`,
            })
        });

        table.printTable()
    }
}
