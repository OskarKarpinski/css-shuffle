# CSS Shuffle

<div align="center">

[![npm version](https://img.shields.io/npm/v/css-shuffle.svg)](https://www.npmjs.com/package/css-shuffle)
[![license](https://img.shields.io/npm/l/css-shuffle.svg)](https://github.com/OskarKarpinski/css-shuffle/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dt/css-shuffle.svg)](https://www.npmjs.com/package/css-shuffle)
[![GitHub stars](https://img.shields.io/github/stars/OskarKarpinski/css-shuffle.svg?style=social)](https://github.com/OskarKarpinski/css-shuffle)

**Advanced CSS obfuscator that automatically renames classes, IDs and variables across your entire website**

Obfuscate your production build, make your source code much harder to reverse engineer and automatically reduce your website size


</div>

---

## ✨ Features

| Feature | Status |
|---------|:------:|
| ✅ CSS class name obfuscation | ✓ |
| ✅ DOM element ID obfuscation | ✓ |
| ✅ CSS custom properties (variables) obfuscation | ✓ |
| ✅ Updates references in HTML attributes | ✓ |
| ✅ Processes inline `<style>` tags inside HTML | ✓ |
| ✅ Analyzes & updates JavaScript DOM API calls | ✓ |
| ✅ Astro framework official integration | ✓ |
| ✅ Consistent mapping across all file types | ✓ |
| ✅ Generates original ⟷ obfuscated name mapping | ✓ |
| ✅ Automatic file size optimization | ✓ |
| ✅ Stats report with size reduction | ✓ |

### JavaScript DOM API Support
CSS Shuffle automatically detects and updates:
- `classList.add() / remove() / toggle() / contains() / replace()`
- `querySelector() / querySelectorAll()`
- `getElementById()`
- `getElementsByClassName()`
- `setAttribute('class' / 'id')`
- Direct `element.className` assignments

## 📦 Installation

```bash
npm install css-shuffle --save-dev
```

## 🚀 Usage

### Astro Integration
Add to your Astro project configuration:

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

It will automatically run during production build.

### Standalone Usage

```javascript
import { CSSShuffle } from 'css-shuffle';

const shuffler = new CSSShuffle();

// Process entire directory
await shuffler.obfuscate('./your-source-folder', './output-folder');

// Get mapping of original -> obfuscated names
console.log(shuffler.getMappingJSON());

// Save mapping to file
shuffler.saveMappingJSON('./css-mapping.json');

// Print processing statistics
shuffler.printStatsTable();
```

## ⚙️ How it works

1. **Copy phase** - all files are copied from input directory to output directory
2. **Scan phase** - all CSS files and inline styles are parsed and all identifiers are collected
3. **Renaming phase** - every unique identifier gets assigned a short unique randomized name
4. **Replace phase** - all references are updated consistently across CSS, HTML and JavaScript files
5. **Report phase** - processing statistics and mapping file are generated

## 📋 Output Example

### Before obfuscation:
```css
.main-navigation {
  background: var(--primary-color);
}

#hero-banner {
  padding: 2rem;
}
```

```html
<div class="main-navigation" id="hero-banner">...</div>
```

```javascript
document.getElementById('hero-banner').classList.add('active');
```

### After obfuscation:
```css
.a {
  background: var(--b);
}

#c {
  padding: 2rem;
}
```

```html
<div class="a" id="c">...</div>
```

```javascript
document.getElementById('c').classList.add('d');
```

## 📊 Statistics

After processing you will get a report similar to this:

| File | Original Size | New Size | Reduced |
|------|---------------|----------|---------|
| /styles.css | 124 KB | 87 KB | 30% |
| /index.html | 42 KB | 28 KB | 33% |
| /app.js | 210 KB | 185 KB | 12% |

Average size reduction for typical websites is **20-35%** as a side effect.

## ⚠️ Important Notes

> **This tool is intended for code obfuscation, not security.**
>
> It will make your code significantly harder to read, but it is not encryption. Determined attackers can still reverse engineer it.

✅ Always test your website thoroughly after obfuscation
✅ Keep the mapping file for debugging purposes
✅ Do not run this on development environments
✅ Report any issues you encounter on GitHub

## 🔧 Requirements

- Node.js 18+
- Any modern build system

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">
If this project is useful to you, please give it a ⭐ star on GitHub!
</div>