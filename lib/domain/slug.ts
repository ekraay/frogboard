// Paths that would shadow an event slug at the site root. An event must never
// claim one of these, or its board becomes unreachable.
export const RESERVED_SLUGS = new Set([
  "e", "b", "organize", "lead", "api", "_next",
  "favicon.ico", "robots.txt", "sitemap.xml", "static", "public",
]);

/** Turn a free-text name into a URL-safe slug. Falls back to "event". */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")              // split accented letters into base + mark
    .replace(/[̀-ͯ]/g, "") // drop the combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")  // any run of non-alphanumerics becomes one hyphen
    .replace(/^-+|-+$/g, "")      // trim leading/trailing hyphens
    .slice(0, 60);
  return slug || "event";
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
