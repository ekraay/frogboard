import { prisma } from "@/lib/db";
import { hashExternalId } from "@/lib/security/hash";
import type { ImportedPerson } from "@/lib/domain/roster";
import { statusCounts, type StatusCounts } from "@/lib/domain/roster";
import { getEventRsvps } from "@/lib/repository/rsvp";
import type { RsvpRecord } from "@/lib/domain/rsvp";

/**
 * Idempotent roster import in one transaction. People with a source id dedup by
 * its hash (existing rows update, new rows insert); people without one always
 * insert. A duplicate source id inside one paste keeps the last row.
 */
export async function importPeople(
  orgId: string,
  group: string,
  rows: ImportedPerson[],
  opts: { minor: boolean },
): Promise<{ created: number; updated: number }> {
  const byHash = new Map<string, ImportedPerson>();
  const withoutHash: ImportedPerson[] = [];
  for (const row of rows) {
    const hash = row.externalId ? hashExternalId(row.externalId) : null;
    if (hash) byHash.set(hash, row);
    else withoutHash.push(row);
  }

  const existing = byHash.size
    ? await prisma.person.findMany({
        where: { orgId, externalIdHash: { in: [...byHash.keys()] } },
        select: { id: true, externalIdHash: true },
      })
    : [];
  const idByHash = new Map(existing.map((p) => [p.externalIdHash!, p.id]));

  const rowData = (row: ImportedPerson, hash: string | null) => ({
    name: row.name, group, subGroup: row.subGroup, position: row.position,
    minor: opts.minor, externalIdHash: hash,
  });
  const toCreate: ReturnType<typeof rowData>[] = withoutHash.map((row) => rowData(row, null));
  const toUpdate: { id: string; data: ReturnType<typeof rowData> }[] = [];
  for (const [hash, row] of byHash) {
    const id = idByHash.get(hash);
    if (id) toUpdate.push({ id, data: rowData(row, hash) });
    else toCreate.push(rowData(row, hash));
  }

  await prisma.$transaction([
    prisma.person.createMany({ data: toCreate.map((d) => ({ orgId, ...d })) }),
    ...toUpdate.map((u) =>
      prisma.person.update({ where: { id: u.id }, data: { ...u.data, active: true } }),
    ),
  ]);
  return { created: toCreate.length, updated: toUpdate.length };
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
