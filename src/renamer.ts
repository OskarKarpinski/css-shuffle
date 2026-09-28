const START_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NEXT_CHARS = START_CHARS + "0123456789";

export class Renamer {
  private nextIndex = 0;

  /** Array of protected names that should not be obfuscated */
  readonly protected = new Set<string>();

  /** Safelist patterns (strings or RegExps) that should be preserved */
  readonly safelist: (string | RegExp)[] = [];

  constructor(safelist?: (string | RegExp)[]) {
    if (safelist) {
      this.safelist = [...safelist];
    }
  }

  /** Map of original names to their new obfuscated names */
  readonly renames = new Map<string, string>();

  isProtected(key: string): boolean {
    if (this.protected.has(key)) {
      return true;
    }
    for (const pattern of this.safelist) {
      if (typeof pattern === "string") {
        if (pattern === key) return true;
      } else if (pattern.test(key)) {
        return true;
      }
    }
    return false;
  }

  rename(key: string): string {
    if (this.isProtected(key)) {
      return key;
    }

    if (this.renames.has(key)) {
      return this.renames.get(key)!;
    }

    let name = "";
    do {
      let index = this.nextIndex;
      name = "";

      // First character
      name = START_CHARS[index % START_CHARS.length] + name;
      index = Math.floor(index / START_CHARS.length);

      // Subsequent characters
      while (index > 0) {
        index--; // Adjust for 0-based index
        name = NEXT_CHARS[index % NEXT_CHARS.length] + name;
        index = Math.floor(index / NEXT_CHARS.length);
      }

      this.nextIndex++;
    } while (this.isProtected(name));

    this.renames.set(key, name);

    return name;
  }

  get(key: string): string {
    if (this.isProtected(key)) {
      return key;
    }

    let value = this.renames.get(key);
    if (value == undefined) return key;
    return value;
  }

  protect(name: string): void {
    if (!this.protected.has(name)) {
      this.protected.add(name);
    }
  }
}
