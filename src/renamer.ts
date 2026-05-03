const START_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NEXT_CHARS = START_CHARS + "0123456789";

export class Renamer {
  private nextIndex = 0;

  /** Map of original names to their new obfuscated names */
  readonly renames = new Map<string, string>();

  rename(key: string): string {
    if (this.renames.has(key)) {
      return this.renames.get(key)!;
    }

    let index = this.nextIndex;
    let name = "";

    // First character
    name = START_CHARS[index % START_CHARS.length] + name;
    index = Math.floor(index / START_CHARS.length);

    // Subsequent characters
    while (index > 0) {
      index--; // Adjust for 0-based index
      name = NEXT_CHARS[index % NEXT_CHARS.length] + name;
      index = Math.floor(index / NEXT_CHARS.length);
    }

    this.renames.set(key, name);

    this.nextIndex++;
    return name;
  }

  get(key: string): string {
    let value = this.renames.get(key);
    if (value == undefined) return key;
    return value;
  }
}
