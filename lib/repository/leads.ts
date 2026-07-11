import { prisma } from "@/lib/db";
import type { Lead } from "@prisma/client";
import { newClaimToken } from "@/lib/security/tokens";

export async function createLead(eventId: string, group: string, name: string): Promise<Lead> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { orgId: true } });
  return prisma.lead.create({ data: { eventId, orgId: event.orgId, group, name, token: newClaimToken() } });
}

export async function removeLead(id: string): Promise<boolean> {
  const res = await prisma.lead.deleteMany({ where: { id } });
  return res.count > 0;
}

export async function regenerateLeadToken(id: string): Promise<Lead | null> {
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.lead.update({ where: { id }, data: { token: newClaimToken() } });
}

export async function getEventLeads(
  eventId: string,
): Promise<{ id: string; group: string; name: string; token: string }[]> {
  return prisma.lead.findMany({
    where: { eventId },
    orderBy: [{ group: "asc" }, { createdAt: "asc" }],
    select: { id: true, group: true, name: true, token: true },
  });
}

/** The scope a lead token authorizes, or null. Used to gate RSVP writes. */
export async function getLeadAuth(
  token: string,
): Promise<{ eventId: string; orgId: string; group: string } | null> {
  const lead = await prisma.lead.findUnique({
    where: { token },
    select: { eventId: true, orgId: true, group: true },
  });
  return lead;
}
