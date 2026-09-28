# Astro SSR Example with CSS Shuffle

This example demonstrates using `css-shuffle` in an on-demand server-side rendered (SSR) Astro project with `@astrojs/node`.

## How to Run

```bash
npm install
npm run build
npm start
```

Visit `http://localhost:4321` in your browser. The server dynamically emits HTML with obfuscated classes that perfectly match the compiled stylesheets without any runtime latency.
