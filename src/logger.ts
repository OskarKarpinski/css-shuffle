/**
 * Colorized, structured debug logger for CSS Shuffle.
 *
 * Enabled by setting CSS_SHUFFLE=debug or CSS_SHUFFLE_DEBUG=1/true.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const LEVEL_COLORS = {
  info: "\x1b[36m", // cyan
  scan: "\x1b[33m", // yellow
  replace: "\x1b[32m", // green
  done: "\x1b[35m", // magenta
  error: "\x1b[31m", // red
} as const;

/**
 * Debug is enabled when CSS_SHUFFLE=debug or CSS_SHUFFLE_DEBUG=1/true.
 */
const DEBUG_ENABLED =
  process.env.CSS_SHUFFLE === "debug" ||
  process.env.CSS_SHUFFLE_DEBUG === "1" ||
  process.env.CSS_SHUFFLE_DEBUG === "true";

let scanIndent = 0;

/**
 * Generic debug log message (only shown when debug is enabled).
 */
export function debugLog(trace: string, message: string) {
  if (!DEBUG_ENABLED) return;
  const indent = "  ".repeat(scanIndent);
  console.log(`${DIM}${indent}css-shuffle${RESET} [${trace}]: ${message}`);
}

/**
 * Log a section header for organizing debug output.
 */
export function debugHeader(title: string) {
  if (!DEBUG_ENABLED) return;
  const line = "─".repeat(50);
  console.log(`\n${BOLD}${line}${RESET}`);
  console.log(`${BOLD}  ${title}${RESET}`);
  console.log(`${BOLD}${line}${RESET}\n`);
}

/**
 * Log a scan-phase event (discovering names in files).
 */
export function debugScan(
  source: string,
  filePath: string,
  kind: string,
  name: string,
) {
  if (!DEBUG_ENABLED) return;
  const color = LEVEL_COLORS.scan;
  console.log(
    `${color}  [SCAN]${RESET} ${DIM}${filePath}${RESET}` +
      ` ${DIM}|${RESET} ${kind} ${color}${name}${RESET}` +
      ` ${DIM}(in ${source})${RESET}`,
  );
}

/**
 * Log a replace-phase event (applying a rename).
 */
export function debugReplace(
  source: string,
  filePath: string,
  kind: string,
  original: string,
  obfuscated: string,
) {
  if (!DEBUG_ENABLED) return;
  const color = LEVEL_COLORS.replace;
  console.log(
    `${color}  [REPLACE]${RESET} ${DIM}${filePath}${RESET}` +
      ` ${DIM}|${RESET} ${kind}: ${DIM}${original}${RESET}` +
      ` ${color}→${RESET} ${color}${obfuscated}${RESET}` +
      ` ${DIM}(in ${source})${RESET}`,
  );
}