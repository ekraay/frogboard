import { prisma } from "@/lib/db";
import type { Person } from "@prisma/client";
import { hashExternalId } from "@/lib/security/hash";
import type { ImportedPerson } from "@/lib/domain/roster";
import { statusCounts, type StatusCounts } from "@/lib/domain/roster";
import { getEventRsvps } from "@/lib/repository/rsvp";
import type { RsvpRecord } from "@/lib/domain/rsvp";

/** Idempotent roster import. People with a source id dedup by its hash; others are created. */
export async function importPeople(
  orgId: string,
  group: string,
  rows: ImportedPerson[],
  opts: { minor: boolean },
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const externalIdHash = row.externalId ? hashExternalId(row.externalId) : null;
    const data = {
      name: row.name, group, subGroup: row.subGroup, position: row.position,
      minor: opts.minor, externalIdHash,
    };
    if (externalIdHash) {
      const existing = await prisma.person.findUnique({
        where: { orgId_externalIdHash: { orgId, externalIdHash } },
      });
      if (existing) {
        await prisma.person.update({ where: { id: existing.id }, data: { ...data, active: true } });
        updated += 1;
        continue;
      }
    }
    await prisma.person.create({ data: { orgId, ...data } });
    created += 1;
  }
  return { created, updated };
}

export async function addPerson(
  orgId: string,
  data: { name: string; group: string; subGroup?: string | null; minor?: boolean },
): Promise<Person> {
  return prisma.person.create({
    data: { orgId, name: data.name, group: data.group, subGroup: data.subGroup ?? null, minor: data.minor ?? false },
  });
}

/** False when the person is already gone. Soft-deactivates (keeps history). */
export async function deactivatePerson(id: string): Promise<boolean> {
  const res = await prisma.person.updateMany({ where: { id }, data: { active: false } });
  return res.count > 0;
}

/** Active people in an org, optionally one group, ordered by sub-group then name. */
export async function getDirectory(orgId: string, group?: string): Promise<Person[]> {
  return prisma.person.findMany({
    where: { orgId, active: true, ...(group ? { group } : {}) },
    orderBy: [{ subGroup: "asc" }, { name: "asc" }],
  });
}

/** Attendance counts per group for an event: what the org coordinator sees (no names). */
export async function getGroupRollups(eventId: string): Promise<{ group: string; counts: StatusCounts }[]> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { orgId: true } });
  const people = await prisma.person.findMany({
    where: { orgId: event.orgId, active: true, NOT: { group: null } },
    select: { id: true, group: true },
  });
  const rsvps = await getEventRsvps(eventId);
  const byPerson = new Map<string, RsvpRecord[]>();
  for (const r of rsvps) {
    if (!byPerson.has(r.personId)) byPerson.set(r.personId, []);
    byPerson.get(r.personId)!.push({ day: r.day, status: r.status });
  }
  const groups = new Map<string, { id: string }[]>();
  for (const p of people) {
    const g = p.group!;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ id: p.id });
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, ppl]) => ({ group, counts: statusCounts(ppl, byPerson) }));
}
