import { createHmac } from "node:crypto";

// A fixed salt so the same source id hashes the same on re-import (dedup). The
// dev fallback keeps tests deterministic; production must set its own secret so
// short numeric Scout IDs stay unguessable from a database dump.
function rosterSalt(): string {
  const configured = process.env.ROSTER_ID_SALT;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ROSTER_ID_SALT must be set in production to keep Scout ID hashes unguessable.");
  }
  return "frogboard-dev-roster-salt";
}

/** Salted hash of a source identifier (e.g. Scout ID) for import dedup. Never store the raw id. */
export function hashExternalId(raw: string): string {
  return createHmac("sha256", rosterSalt()).update(raw.trim()).digest("hex");
}
