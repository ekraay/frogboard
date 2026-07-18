// @vitest-environment node
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { upsertGroup, resolveGroupId, moveMembership } from "@/lib/repository/groups";

const ORG = "org_bcsf";
beforeEach(async () => { await resetDb(); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await prisma.$disconnect(); });

test("upsertGroup creates once and returns the same id on repeat", async () => {
  const a = await upsertGroup(ORG, "Scouts");
  const b = await upsertGroup(ORG, "Scouts");
  expect(a).toBe(b);
  expect(await prisma.group.count({ where: { orgId: ORG, name: "Scouts" } })).toBe(1);
});

test("upsertGroup recovers from a P2002 race by re-reading the winner's row", async () => {
  const existing = await prisma.group.create({ data: { orgId: ORG, name: "Racy" } });
  vi.spyOn(prisma.group, "findUnique").mockResolvedValueOnce(null);
  vi.spyOn(prisma.group, "create").mockRejectedValueOnce(
    new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" }),
  );
  const id = await upsertGroup(ORG, "Racy");
  expect(id).toBe(existing.id);
});

test("resolveGroupId returns null for an unknown name", async () => {
  expect(await resolveGroupId(ORG, "Nope")).toBeNull();
});

test("moveMembership makes the target the person's only membership", async () => {
  const p = await prisma.person.create({ data: { orgId: ORG, name: "Simon" } });
  const scouts = await upsertGroup(ORG, "Scouts");
  const taiko = await upsertGroup(ORG, "Taiko");
  await moveMembership(p.id, scouts, "Fox");
  await moveMembership(p.id, taiko, null);
  const memberships = await prisma.membership.findMany({ where: { personId: p.id } });
  expect(memberships).toHaveLength(1);
  expect(memberships[0].groupId).toBe(taiko);
  expect(memberships[0].subGroup).toBeNull();
});

test("moveMembership updates subGroup in place when the group is unchanged", async () => {
  const p = await prisma.person.create({ data: { orgId: ORG, name: "Simon" } });
  const scouts = await upsertGroup(ORG, "Scouts");
  await moveMembership(p.id, scouts, "Fox");
  await moveMembership(p.id, scouts, "Hawk");
  const memberships = await prisma.membership.findMany({ where: { personId: p.id } });
  expect(memberships).toHaveLength(1);
  expect(memberships[0].groupId).toBe(scouts);
  expect(memberships[0].subGroup).toBe("Hawk");
});
