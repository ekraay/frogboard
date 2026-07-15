import { prisma } from "@/lib/db";
import type { Lead } from "@prisma/client";
import { newClaimToken } from "@/lib/security/tokens";
import { rosterView, type RosterGroup, patrolSummary, type PatrolSummary, statusCounts, type StatusCounts, type RosterPerson } from "@/lib/domain/roster";
import { getEventRsvps } from "@/lib/repository/rsvp";
import { boardDisplayName } from "@/lib/domain/displayName";
import type { RsvpRecord } from "@/lib/domain/rsvp";

export async function createLead(eventId: string, group: string, name: string): Promise<Lead> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { orgId: true } });
  return prisma.lead.create({ data: { eventId, orgId: event.orgId, group, name, token: newClaimToken() } });
}

/** Delete a lead only within its own event, so a caller can't revoke another event's link. */
export async function removeLead(id: string, eventId: string): Promise<boolean> {
  const res = await prisma.lead.deleteMany({ where: { id, eventId } });
  return res.count > 0;
}

/** Roll a lead's token only within its own event. */
export async function regenerateLeadToken(id: string, eventId: string): Promise<Lead | null> {
  const existing = await prisma.lead.findFirst({ where: { id, eventId } });
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

/** A lead's read view: their whole group (abbreviated names, no contact details), counts, and per-patrol summary. */
export async function getLeadRosterView(
  token: string,
): Promise<{ group: string; eventName: string; counts: StatusCounts; byPatrol: PatrolSummary[]; roster: RosterGroup[]; boardParam: string } | null> {
  const lead = await prisma.lead.findUnique({
    where: { token },
    select: { group: true, orgId: true, eventId: true, event: { select: { name: true, slug: true, id: true } } },
  });
  if (!lead) return null;
  const people = await prisma.person.findMany({
    where: { orgId: lead.orgId, active: true, group: lead.group },
    select: { id: true, name: true, subGroup: true, minor: true, position: true },
  });
  const rsvps = await getEventRsvps(lead.eventId);
  const byPerson = new Map<string, RsvpRecord[]>();
  for (const r of rsvps) {
    if (!byPerson.has(r.personId)) byPerson.set(r.personId, []);
    byPerson.get(r.personId)!.push({ day: r.day, status: r.status, reason: r.reason });
  }
  // Abbreviate before building the view so a full surname never leaves the server.
  const roster: RosterPerson[] = people.map((p) => ({
    id: p.id, name: boardDisplayName(p.name, p.minor), subGroup: p.subGroup, minor: p.minor, position: p.position,
  }));
  return {
    group: lead.group,
    eventName: lead.event.name,
    counts: statusCounts(roster, byPerson),
    byPatrol: patrolSummary(roster, byPerson),
    roster: rosterView(roster, byPerson),
    boardParam: lead.event.slug ?? lead.event.id,
  };
}
