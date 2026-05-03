# CSS Shuffle

<div align="center">

[![npm version](https://img.shields.io/npm/v/css-shuffle.svg)](https://www.npmjs.com/package/css-shuffle)
[![license](https://img.shields.io/npm/l/css-shuffle.svg)](https://github.com/OskarKarpinski/css-shuffle/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dt/css-shuffle.svg)](https://www.npmjs.com/package/css-shuffle)
[![GitHub stars](https://img.shields.io/github/stars/OskarKarpinski/css-shuffle.svg?style=social)](https://github.com/OskarKarpinski/css-shuffle)

**Advanced CSS obfuscator that automatically renames classes, IDs and CSS custom properties across your entire website.**

Obfuscate your production build, make your source code substantially harder to reverse engineer, and shrink your file sizes—all with zero configuration.

</div>

---

## Features

| Feature | Status |
|---------|:------:|
| CSS class name obfuscation | ✅ |
| DOM element ID obfuscation | ✅ |
| CSS custom properties (variables) obfuscation | ✅ |
| `@property` at-rule support | ✅ |
| Updates class/id references in HTML attributes | ✅ |
| Processes inline `<style>` tags inside HTML | ✅ |
| Rewrites ARIA ID-reference attributes | ✅ |
| Handles `<label for="...">` references | ✅ |
| Protects hash-fragment URLs (`href="/#projects"`) | ✅ |
| Analyzes & updates JavaScript DOM API calls | ✅ |
| Babel-based JS AST transformation | ✅ |
| Astro framework official integration | ✅ |
| Consistent mapping across all file types | ✅ |
| Generates original ⟷ obfuscated name mapping | ✅ |
| Automatic file size reduction | ✅ |
| Stats report with size reduction per file | ✅ |

---

## JavaScript DOM API Support

CSS Shuffle automatically detects and rewrites class and ID references inside the following JavaScript DOM operations:

### classList methods
- `element.classList.add('name')`
- `element.classList.remove('name')`
- `element.classList.toggle('name')`
- `element.classList.contains('name')`
- `element.classList.replace('old', 'new')`

### Element queries
- `document.querySelector('.my-class')`
- `document.querySelectorAll('#my-id')`
- `element.querySelector('.child')`
- `element.querySelectorAll('.child')`

### Element lookup
- `document.getElementById('my-id')`
- `document.getElementsByClassName('my-class')`

### Attribute manipulation
- `element.setAttribute('class', 'foo bar')`
- `element.setAttribute('id', 'baz')`

### Direct property assignment
- `element.className = 'foo bar'`

> **Note:** CSS Shuffle uses Babel to parse JavaScript and intelligently traces DOM element references through variable declarations, function parameters, and iterator callbacks (`.forEach()`, `.map()`, etc.) to ensure only genuine DOM API calls are obfuscated.

---

## Installation

```bash
npm install css-shuffle --save-dev
```

---

## Quick Start

```javascript
import { CSSShuffle } from 'css-shuffle';

const shuffler = new CSSShuffle();

// Process an entire directory (source → destination)
await shuffler.obfuscate('./src', './dist');

// Get the full mapping of original → obfuscated names
console.log(shuffler.getMappingJSON());

// Save the mapping to a file for debugging
shuffler.saveMappingJSON('./css-mapping.json');

// Print processing statistics to the console
shuffler.printStatsTable();
```

You can also obfuscate a directory **in-place** by omitting the second argument:

```javascript
const shuffler = new CSSShuffle();
await shuffler.obfuscate('./my-build-folder'); // modifies in-place
```

---

## Astro Integration

CSS Shuffle provides a first-class [Astro](https://astro.build/) integration that automatically runs during the production build.

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { astro as cssShuffle } from 'css-shuffle';

export default defineConfig({
  integrations: [
    cssShuffle()
  ]
});
```

How it works:

1. After Astro finishes building to the output directory, `css-shuffle` is invoked.
2. All HTML, CSS, and JavaScript files in the build output are obfuscated.
3. A stats table is printed to the console.
4. A `mapping.json` file is saved one level above the output directory.

No configuration needed—it just works.

> For non-Astro projects, use the standalone [`CSSShuffle`](#cssshuffle) class instead.

---

## API Reference

### `CSSShuffle`

The main class for standalone usage.

#### Constructor

```javascript
const shuffler = new CSSShuffle();
```

#### Methods

##### `async obfuscate(input: string, dist?: string): Promise<void>`

Processes all HTML, CSS, and JavaScript files in the `input` directory.

- If `dist` is provided, files are first **copied** from `input` to `dist`, and the copy is obfuscated. The original source is preserved.
- If `dist` is omitted, the `input` directory is **modified in-place**.

File types processed:

| Extension | Processing |
|-----------|------------|
| `.html` | Classes, IDs, `for` attributes, ARIA attributes, inline `<style>`, inline `<script>` |
| `.css` | Class selectors, ID selectors, `@property` names, `var()` references |
| `.js`, `.mjs`, `.cjs` | DOM API calls referencing class names and IDs |

##### `getMapping(): Map<string, string>`

Returns the internal `Map` of original → obfuscated name pairs.

##### `getMappingJSON(): string`

Returns the mapping as a formatted JSON string.

```javascript
const json = shuffler.getMappingJSON();
// {
//   "main-navigation": "a",
//   "hero-banner":     "b",
//   "primary-color":   "c",
//   "active":          "d"
// }
```

##### `saveMappingJSON(path: string): void`

Writes the mapping JSON to a file. Useful for debugging production issues.

```javascript
shuffler.saveMappingJSON('./obfuscation-map.json');
```

##### `printStatsTable(): void`

Prints a table showing file size changes for every modified file.

```
┌───────────────┬───────────────┬──────────┬──────────┐
│ File          │ Original Size │ New Size │ Reduced  │
├───────────────┼───────────────┼──────────┼──────────┤
│ /styles.css   │ 124.0 kB      │ 86.3 kB  │ 30%      │
│ /index.html   │ 42.0 kB       │ 27.8 kB  │ 34%      │
│ /app.js       │ 210.0 kB      │ 185.2 kB │ 12%      │
└───────────────┴───────────────┴──────────┴──────────┘
```

---

### `astro` (Integration)

The Astro integration function. Import and use it in your `astro.config.mjs`.

```javascript
import { astro as cssShuffle } from 'css-shuffle';
```

This is a named export that returns an `AstroIntegration` object. It hooks into the `astro:build:done` lifecycle to obfuscate the build output automatically.

---

## How It Works

CSS Shuffle processes your files in five distinct phases:

### 1. Copy Phase

If a separate output directory is specified, all files are copied from the source to the output directory. The original source is never modified.

### 2. Scan Phase

- All HTML files are scanned for **hash fragment references** (e.g., `href="/#projects"`). These IDs are **protected** from renaming because they link to anchors on the same page.
- All CSS files and inline `<style>` tags are parsed, and every class name, ID, and custom property (`--*`) is collected.

### 3. Renaming Phase

Every unique identifier is assigned a short, randomized name (e.g., `main-navigation` → `a`, `header-wrapper` → `b`). The renaming algorithm produces concise, single-character names first, maximizing file size reduction.

### 4. Replace Phase

All references are updated **consistently** across your entire project:

- **CSS files**: Selectors, `@property` at-rules, and `var()` references.
- **HTML files**: `class`, `id`, `for`, and ARIA attributes. Inline `<style>` and `<script>` contents are also processed.
- **JavaScript files**: DOM API calls are detected via Babel AST traversal and updated with the new names.

### 5. Report Phase

A processing summary is printed, including file size reductions, and the original-to-obfuscated name mapping can be exported to a JSON file.

---

## Output Example

### Before obfuscation

```css
/* style.css */
.main-navigation {
  background: var(--primary-color);
  color: var(--text-color);
}

#hero-banner {
  padding: 2rem;
}

.card.active {
  border-color: var(--primary-color);
}
```

```html
<!-- index.html -->
<div class="main-navigation" id="hero-banner">
  <div class="card active">Featured</div>
  <label for="email-input">Email:</label>
  <input id="email-input" type="email" />
</div>
```

```javascript
// app.js
const banner = document.getElementById('hero-banner');
banner.classList.add('active');

const cards = document.querySelectorAll('.card');
cards.forEach(card => {
  card.classList.remove('active');
});
```

### After obfuscation

```css
/* style.css */
.a {
  background: var(--b);
  color: var(--c);
}

#d {
  padding: 2rem;
}

.e.f {
  border-color: var(--b);
}
```

```html
<!-- index.html -->
<div class="a" id="d">
  <div class="e f">Featured</div>
  <label for="g">Email:</label>
  <input id="g" type="email" />
</div>
```

```javascript
// app.js
const banner = document.getElementById('d');
banner.classList.add('f');

const cards = document.querySelectorAll('.e');
cards.forEach(card => {
  card.classList.remove('f');
});
```

### Generated mapping

```json
{
  "main-navigation": "a",
  "primary-color":   "b",
  "text-color":      "c",
  "hero-banner":     "d",
  "card":            "e",
  "active":          "f",
  "email-input":     "g"
}
```

---

## Statistics

After processing, you get a detailed per-file report showing the size impact.

```
┌─────────────────┬───────────────┬──────────┬──────────┐
│ File            │ Original Size │ New Size │ Reduced  │
├─────────────────┼───────────────┼──────────┼──────────┤
│ /styles.css     │ 124.0 kB      │ 86.3 kB  │ 30%      │
│ /index.html     │ 42.0 kB       │ 27.8 kB  │ 34%      │
│ /app.js         │ 210.0 kB      │ 185.2 kB │ 12%      │
│ /components.js  │ 18.5 kB       │ 15.8 kB  │ 15%      │
├─────────────────┼───────────────┼──────────┼──────────┤
│ Total           │ 394.5 kB      │ 315.1 kB │ 20%      │
└─────────────────┴───────────────┴──────────┴──────────┘
```

Average size reduction for typical websites is **20–35%** as a side effect of shortening long, descriptive class and ID names to minimal identifiers.

---

## Important Notes

> **⚠️ This tool is intended for code obfuscation, not security.**
>
> It will make your code significantly harder to read and reverse engineer, but it is not encryption. Determined attackers can still reconstruct the semantics of your code. Do not rely on this as your sole security measure.

### Best Practices

- ✅ **Always test your website thoroughly** after obfuscation before deploying to production.
- ✅ **Keep the mapping file** (`mapping.json`) for debugging production issues. Without it, you won't be able to map obfuscated names back to originals.
- ✅ **Run this only on production builds.** Development environments benefit from readable class names for debugging.

### Known Limitations

- CSS Shuffle does **not** obfuscate HTML tag names or attribute names (only their values).
- JavaScript property access using bracket notation with computed strings (e.g., `element['classList']['add'](name)`) is not detected.
- Dynamically constructed selectors (e.g., `` `.card-${index}` `` with template expressions) are not transformed.

---

## Requirements

- Works with any build system (Webpack, Vite, Astro, etc.)
- No framework dependencies for standalone usage

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

<div align="center">
If this project is useful to you, please give it a ⭐ on GitHub!
</div>
