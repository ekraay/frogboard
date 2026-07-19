import { prisma } from "@/lib/db";
import { upsertGroup, moveMembership } from "@/lib/repository/groups";

/** A person plus their group/membership, dual-writing the legacy string. */
export async function personInGroup(
  orgId: string,
  group: string,
  data: { name: string; subGroup?: string | null; minor?: boolean | null; active?: boolean },
) {
  const person = await prisma.person.create({
    data: { orgId, name: data.name, group, subGroup: data.subGroup ?? null, minor: data.minor ?? null, active: data.active ?? true },
  });
  const groupId = await upsertGroup(orgId, group);
  await moveMembership(person.id, groupId, data.subGroup ?? null);
  return person;
}
