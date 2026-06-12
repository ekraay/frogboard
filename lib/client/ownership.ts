"use client";

// Device-local proof of who made a claim. Not a security boundary — it just
// keeps the remove control to the person (device) who signed up, like holding
// the stub of a ticket you tore off a board.
const KEY = "frogboard.claims";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberClaim(signupId: string, token: string) {
  const map = readMap();
  map[signupId] = token;
  window.localStorage.setItem(KEY, JSON.stringify(map));
}

export function getClaimToken(signupId: string): string | null {
  return readMap()[signupId] ?? null;
}

export function forgetClaim(signupId: string) {
  const map = readMap();
  delete map[signupId];
  window.localStorage.setItem(KEY, JSON.stringify(map));
}
