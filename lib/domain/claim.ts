import type { SlotInfo } from "@/lib/domain/types";

export const LIMITS = { name: 80, group: 40, email: 120, phone: 40 } as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ClaimInput {
  name: string;
  email?: string;
  phone?: string;
  group?: string;
  minor?: boolean;
  /** Hidden form field; bots fill it, humans never see it. */
  honeypot?: string;
}

export interface ClaimValue {
  name: string;
  email: string | null;
  phone: string | null;
  group: string | null;
  minor: boolean | null;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type VoidResult = { ok: true } | { ok: false; error: string };

function nullIfBlank(v: string | undefined): string | null {
  const trimmed = (v ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function validateClaim(input: ClaimInput, slot: SlotInfo): Result<ClaimValue> {
  // Honeypot: a filled hidden field means a bot. Fail generically.
  if ((input.honeypot ?? "").trim() !== "") {
    return { ok: false, error: "Could not submit. Please try again." };
  }

  const name = (input.name ?? "").trim();
  if (name === "") return { ok: false, error: "Please enter a name." };
  if (name.length > LIMITS.name) return { ok: false, error: "Name is too long." };
  if (slot.isFull) return { ok: false, error: "This task is already full." };

  const email = nullIfBlank(input.email);
  if (email && email.length > LIMITS.email) return { ok: false, error: "Email is too long." };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "That email doesn't look right." };

  const phone = nullIfBlank(input.phone);
  if (phone && phone.length > LIMITS.phone) return { ok: false, error: "Phone is too long." };

  const group = nullIfBlank(input.group);
  if (group && group.length > LIMITS.group) return { ok: false, error: "Group is too long." };

  return {
    ok: true,
    value: { name, email, phone, group, minor: input.minor ?? null },
  };
}

export function validateRelease(
  signup: { claimToken: string | null },
  providedToken: string | null,
): VoidResult {
  if (!signup.claimToken || !providedToken || signup.claimToken !== providedToken) {
    return { ok: false, error: "You can only remove your own signup." };
  }
  return { ok: true };
}
