import { createHmac } from "node:crypto";

// A fixed salt so the same source id hashes the same on re-import (dedup). Set
// ROSTER_ID_SALT in production; the dev fallback keeps tests deterministic.
const SALT = process.env.ROSTER_ID_SALT ?? "frogboard-dev-roster-salt";

/** Salted hash of a source identifier (e.g. Scout ID) for import dedup. Never store the raw id. */
export function hashExternalId(raw: string): string {
  return createHmac("sha256", SALT).update(raw.trim()).digest("hex");
}
