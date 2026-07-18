// @vitest-environment node
import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { upsertGroup, resolveGroupId, moveMembership } from "@/lib/repository/groups";

const ORG = "org_bcsf";
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

test("upsertGroup creates once and returns the same id on repeat", async () => {
  const a = await upsertGroup(ORG, "Scouts");
  const b = await upsertGroup(ORG, "Scouts");
  expect(a).toBe(b);
  expect(await prisma.group.count({ where: { orgId: ORG, name: "Scouts" } })).toBe(1);
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
