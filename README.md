# CSS Shuffle

<div align="center">

[![npm version](https://img.shields.io/npm/v/css-shuffle.svg)](https://www.npmjs.com/package/css-shuffle)
[![license](https://img.shields.io/npm/l/css-shuffle.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/OskarKarpinski/css-shuffle.svg?style=social)](https://github.com/OskarKarpinski/css-shuffle)

**Fast, build-time CSS and class name obfuscator for Astro, Vite, and modern web apps.**

Renames classes, element IDs, and CSS variables across stylesheets, HTML templates, and JavaScript DOM code into minimal, scrambled identifiers.

</div>

---

## ✨ Features

- ⚡ **Build-Time Performance**: Zero runtime latency, zero memory buffering—fully compatible with Astro SSR streaming and Server Islands.
- 🚀 **Astro & Vite First-Class Support**: Seamless integrations for Astro (Static & SSR) and any Vite-based app (React, Vue, Svelte, Solid).
- 🔄 **Full Synchronization**: Synchronizes CSS selectors, HTML attributes (`class`, `id`, `for`, ARIA, SVG `#id`), and JavaScript DOM API calls (`querySelector`, `getElementById`, `classList`).
- 🛡️ **Safelist Support**: Protect brand classes, third-party libraries, or dynamic states with string or RegExp patterns.
- 📉 **Smaller Bundles**: Shortens long, descriptive identifiers to minimal characters (`a`, `b`, `c`), saving 20–35% in stylesheet and HTML size.

---

## 📦 Installation

```bash
npm install css-shuffle --save-dev
```

---

## 🚀 Quick Start

### 1. Astro (Static & SSR)

Add the integration to `astro.config.mjs`. Works automatically with both `output: 'static'` and `output: 'server'`:

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import cssShuffle from 'css-shuffle/astro';

export default defineConfig({
  integrations: [
    cssShuffle({
      safelist: ['keep-me', /^is-/],
      mappingFile: 'dist/mapping.json', // optional, set to false to disable
    }),
  ],
});
```

### 2. Vite (React, Vue, Svelte, SPA)

Add the plugin to `vite.config.js`:

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { cssShuffle } from 'css-shuffle/vite';

export default defineConfig({
  plugins: [
    cssShuffle({
      safelist: [/^is-/],
    }),
  ],
});
```

### 3. Programmatic / Post-Build CLI

Obfuscate any static build directory directly with Node.js:

```javascript
import { CSSShuffle } from 'css-shuffle';

const shuffler = new CSSShuffle({
  safelist: ['container'],
});

await shuffler.obfuscate('./src', './dist');
shuffler.printStatsTable();
```

---

## ⚙️ Configuration

Options supported by `cssShuffle()` (Vite/Astro) and `new CSSShuffle()`:

| Option | Type | Default | Description |
|---|---|---|---|
| `safelist` | `(string \| RegExp)[]` | `[]` | Names or patterns to exclude from obfuscation (e.g. `['header', /^is-/]`). |
| `mappingFile` | `string \| false` | `'mapping.json'` | Custom path to save the original ⟷ obfuscated JSON mapping. Set to `false` to disable. |
| `exclude` | `(string \| RegExp)[]` | `['node_modules']` | Files or paths to bypass during compilation (Vite plugin only). |
| `hash` | `boolean \| 'all'` | `true` | Controls CSS asset cache-busting re-hashing (standalone CLI mode only). |

---

## 🔍 Before & After

```css
/* Input: styles.css */
.hero-banner { background: var(--theme-color); }
.hero-banner .btn.is-active { color: white; }
```

```html
<!-- Input: index.html -->
<div class="hero-banner">
  <button id="cta-btn" class="btn is-active">Click</button>
</div>
```

```javascript
// Input: app.js
document.getElementById('cta-btn').classList.toggle('is-active');
```

⬇️ **Obfuscated Output** (with `safelist: [/^is-/]`):

```css
/* Output: styles.css */
.a { background: var(--b); }
.a .c.is-active { color: white; }
```

```html
<!-- Output: index.html -->
<div class="a">
  <button id="d" class="c is-active">Click</button>
</div>
```

```javascript
// Output: app.js
document.getElementById('d').classList.toggle('is-active');
```

---

## 📂 Examples

Check out working code in the [`examples/`](./examples) directory:

- [**Astro Static**](./examples/astro-static) – Standard pre-rendered Astro site.
- [**Astro SSR**](./examples/astro-ssr) – Server-side rendered Astro site with `@astrojs/node`.
- [**Vite**](./examples/vite) – Client-side Vite application.
- [**Node CLI**](./examples/node-cli) – Programmatic post-build directory transformation.

---

## 📄 License

MIT © [Oskar Karpiński](https://github.com/OskarKarpinski)
