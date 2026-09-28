import crypto from "node:crypto";
import path from "node:path";

/**
 * Regex matching filenames with existing content hashes.
 * Matches:
 *  - name.DZQCOZSL.css
 *  - name-DZQCOZSL.css
 *  - name.DZQCOZSL.min.css
 *  - name-DZQCOZSL.min.css
 * Excludes common non-hash names like .min.css, .module.css, etc.
 */
export const HASHED_CSS_REGEX = /^(.+?)[.-]([a-zA-Z0-9_-]{7,32})(\.min)?\.css$/;

const NON_HASH_WORDS = new Set([
  "module",
  "global",
  "bundle",
  "vendor",
  "common",
  "styles",
]);

/**
 * Compute a short SHA-256 hash of the content.
 */
export function computeHash(content: string, length = 8): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, length);
}

/**
 * Determine the new filename for a CSS file based on its content hash and hashing mode.
 * Returns the new basename, or null if the filename should not be changed.
 */
export function getNewHashedFilename(
  filename: string,
  newHash: string,
  hashMode: boolean | "all" = true,
): string | null {
  if (hashMode === false) {
    return null;
  }

  const basename = path.basename(filename);
  const match = basename.match(HASHED_CSS_REGEX);

  if (match) {
    const [, prefix, oldHash, min] = match;
    if (prefix && oldHash && !NON_HASH_WORDS.has(oldHash.toLowerCase())) {
      const sep = basename[prefix.length]; // '.' or '-'
      const minSuffix = min ?? "";
      return `${prefix}${sep}${newHash}${minSuffix}.css`;
    }
  }

  if (hashMode === "all") {
    // Append hash to unhashed files (e.g. styles.css -> styles.[hash].css)
    if (basename.endsWith(".min.css")) {
      const prefix = basename.slice(0, -".min.css".length);
      return `${prefix}.${newHash}.min.css`;
    }
    if (basename.endsWith(".css")) {
      const prefix = basename.slice(0, -".css".length);
      return `${prefix}.${newHash}.css`;
    }
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Safely replace asset filename references without corrupting unrelated words
 * that happen to share a common substring (e.g. remain.css vs main.css).
 */
export function safeReplaceAssetReference(
  content: string,
  oldName: string,
  newName: string,
): string {
  const pattern = new RegExp(
    `(?<=[/"'\`(\\s]|^)${escapeRegex(oldName)}(?=[?"'\`)\\s]|$)`,
    "g",
  );
  return content.replace(pattern, newName);
}
