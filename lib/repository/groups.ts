import { prisma } from "@/lib/db";

/** Find-or-create a group by name, race-safe against a concurrent create. */
export async function upsertGroup(orgId: string, name: string): Promise<string> {
  const existing = await prisma.group.findUnique({ where: { orgId_name: { orgId, name } }, select: { id: true } });
  if (existing) return existing.id;
  try {
    const created = await prisma.group.create({ data: { orgId, name }, select: { id: true } });
    return created.id;
  } catch (e: unknown) {
    // P2002: another writer created it between our read and write.
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      const now = await prisma.group.findUniqueOrThrow({ where: { orgId_name: { orgId, name } }, select: { id: true } });
      return now.id;
    }
    throw e;
  }
}

export async function resolveGroupId(orgId: string, name: string): Promise<string | null> {
  const g = await prisma.group.findUnique({ where: { orgId_name: { orgId, name } }, select: { id: true } });
  return g?.id ?? null;
}

/** Make `groupId` the person's sole membership (move, not add), carrying subGroup. */
export async function moveMembership(personId: string, groupId: string, subGroup: string | null): Promise<void> {
  await prisma.$transaction([
    prisma.membership.deleteMany({ where: { personId, NOT: { groupId } } }),
    prisma.membership.upsert({
      where: { personId_groupId: { personId, groupId } },
      create: { personId, groupId, subGroup },
      update: { subGroup },
    }),
  ]);
}
