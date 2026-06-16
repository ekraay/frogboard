/**
 * The name to show on the PUBLIC board. For a volunteer marked under-18, the
 * last whitespace-delimited word is reduced to an initial ("Alex Tanaka" →
 * "Alex T.") so kids aren't fully named in public. A single-word name has no
 * last name to hide; adults are shown in full. Called server-side so a minor's
 * full surname never reaches the browser.
 */
export function boardDisplayName(name: string, minor?: boolean | null): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!minor || clean === "") return clean;
  const words = clean.split(" ");
  if (words.length <= 1) return clean;
  words[words.length - 1] = words[words.length - 1][0].toUpperCase() + ".";
  return words.join(" ");
}
