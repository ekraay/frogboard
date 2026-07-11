import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { RsvpStatus } from "@/lib/domain/rsvp";

/** Upsert the whole-event answer (day = null). Slice 1 writes only this grain. */
export async function setRsvp(
  personId: string,
  eventId: string,
  status: RsvpStatus,
  reason: string | null,
): Promise<void> {
  const existing = await prisma.rsvp.findFirst({ where: { personId, eventId, day: null } });
  if (existing) {
    await prisma.rsvp.update({ where: { id: existing.id }, data: { status, reason } });
    return;
  }
  try {
    await prisma.rsvp.create({ data: { personId, eventId, day: null, status, reason } });
  } catch (e) {
    // Lost the race to a concurrent whole-event write; the index rejected the duplicate.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      await prisma.rsvp.updateMany({ where: { personId, eventId, day: null }, data: { status, reason } });
      return;
    }
    throw e;
  }
}

export async function getEventRsvps(
  eventId: string,
): Promise<{ personId: string; day: Date | null; status: RsvpStatus; reason: string | null }[]> {
  return prisma.rsvp.findMany({
    where: { eventId },
    select: { personId: true, day: true, status: true, reason: true },
  });
}
