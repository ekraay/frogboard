import { prisma } from "@/lib/db";
import type { Person } from "@prisma/client";
import { hashExternalId } from "@/lib/security/hash";
import type { ImportedPerson } from "@/lib/domain/roster";

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
