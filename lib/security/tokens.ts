import { randomUUID } from "node:crypto";

/** Opaque capability token proving a device owns a signup. Not a security secret. */
export function newClaimToken(): string {
  return randomUUID();
}
