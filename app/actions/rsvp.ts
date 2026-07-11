"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getLeadAuth } from "@/lib/repository/leads";
import { setRsvp } from "@/lib/repository/rsvp";
import type { RsvpStatus } from "@/lib/domain/rsvp";

type Err = { ok: false; error: string };

const STATUSES: RsvpStatus[] = ["yes", "no", "maybe"];

/** A lead records one person's whole-event answer. Authorized by the lead token, scoped to its group. */
export async function setRsvpAction(
  token: string, personId: string, status: RsvpStatus, reason: string | null,
): Promise<{ ok: true } | Err> {
  // Server actions are plain POSTs, so treat every argument as untrusted.
  if (!STATUSES.includes(status)) return { ok: false, error: "Pick yes, no, or maybe." };
  const auth = await getLeadAuth(token);
  if (!auth) return { ok: false, error: "This link isn't valid." };
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { orgId: true, group: true } });
  if (!person || person.orgId !== auth.orgId || person.group !== auth.group) {
    return { ok: false, error: "That person isn't in your group." };
  }
  const cleanReason = typeof reason === "string" && reason.trim() ? reason.trim() : null;
  await setRsvp(personId, auth.eventId, status, cleanReason);
  revalidatePath(`/lead/${token}`);
  return { ok: true };
}
