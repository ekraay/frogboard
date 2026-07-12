// Tiny, pure feature-flag check. A flag is on when its env var is truthy, when
// the request carries the preview cookie, or (outside production) by default so
// development sees new work without ceremony. No global state: everything comes
// from the passed env and cookies.

interface CookieJar {
  get(name: string): { value: string } | undefined;
}

const TRUTHY = new Set(["1", "true"]);

export function flagEnabled(name: string, opts: { cookies: CookieJar }): boolean {
  const env = process.env[`FLAG_${name.toUpperCase()}`];
  if (env && TRUTHY.has(env.toLowerCase())) return true;
  if (opts.cookies.get(`ff_${name}`)?.value === "1") return true;
  return process.env.NODE_ENV !== "production";
}
