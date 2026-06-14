// Uses node:crypto — import only from Node.js runtime contexts (server
// actions, route handlers, server components). Do NOT import from
// middleware.ts (Edge runtime); gate /organize with a cookie check in the
// page/action layer instead.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_MESSAGE = "frogboard-organizer-session-v1";

function secret(): string {
  const pw = process.env.ORGANIZER_PASSWORD;
  if (!pw) throw new Error("ORGANIZER_PASSWORD is not set");
  return pw;
}

/** Constant-time compare via fixed-length digests (handles unequal lengths). */
function digestEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

export function passwordMatches(candidate: string): boolean {
  return digestEqual(candidate, secret());
}

/** Deterministic per password — rotating the password signs everyone out. */
export function sessionToken(): string {
  return createHmac("sha256", secret()).update(TOKEN_MESSAGE).digest("hex");
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  return digestEqual(token, sessionToken());
}

export const SESSION_COOKIE = "frog_organizer";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
