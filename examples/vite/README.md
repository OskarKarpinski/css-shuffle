# Vite Example with CSS Shuffle

This example demonstrates using `css-shuffle` as a native Vite plugin in a client-side application.

## How to Run

```bash
npm install
npm run build
npm run preview
```

Check the files in `dist/` to see that:
- HTML attributes (`class`, `id`) are obfuscated.
- Bundled CSS selectors match the HTML classes.
- Classes matching `/^is-/` (like `.is-active`) are preserved by the safelist.
- JavaScript `document.getElementById` and `classList.toggle` calls are synchronized.
