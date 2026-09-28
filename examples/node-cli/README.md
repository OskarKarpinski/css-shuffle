# Node CLI / Script Example with CSS Shuffle

This example demonstrates using the programmatic Node.js API (`CSSShuffle`) to obfuscate static build directories (HTML, CSS, JS) post-build.

## How to Run

```bash
npm install
npm run build
```

The script will copy `./src` to `./dist`, obfuscate all classes and IDs, write `dist/mapping.json`, and print size reduction statistics.
