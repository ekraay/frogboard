"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getLeadAuth } from "@/lib/repository/leads";
import { setRsvp } from "@/lib/repository/rsvp";
import type { RsvpStatus } from "@/lib/domain/rsvp";

type Err = { ok: false; error: string };

/** A lead records one person's whole-event answer. Authorized by the lead token, scoped to its group. */
export async function setRsvpAction(
  token: string, personId: string, status: RsvpStatus, reason: string | null,
): Promise<{ ok: true } | Err> {
  const auth = await getLeadAuth(token);
  if (!auth) return { ok: false, error: "This link isn't valid." };
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { orgId: true, group: true } });
  if (!person || person.orgId !== auth.orgId || person.group !== auth.group) {
    return { ok: false, error: "That person isn't in your group." };
  }
  await setRsvp(personId, auth.eventId, status, reason?.trim() ? reason.trim() : null);
  revalidatePath(`/lead/${token}`);
  return { ok: true };
}
