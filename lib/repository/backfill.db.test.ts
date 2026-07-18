// @vitest-environment node
import { afterAll, beforeEach, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";

const ORG = "org_bcsf";
const SQL = readFileSync(join(process.cwd(), "prisma/sql/backfill-groups.sql"), "utf8");

// $executeRawUnsafe runs exactly one statement per call, but the canonical
// file holds two INSERTs (plus comments). Strip comments, split on `;`, and
// run each statement in order, so the test still reads from the single
// source of truth used by the migration.
const runBackfill = async () => {
  const statements = SQL.split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
};

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

test("backfills groups and memberships from the legacy strings, idempotently", async () => {
  await prisma.person.create({ data: { orgId: ORG, name: "Active Scout", group: "Scouts", subGroup: "Fox" } });
  await prisma.person.create({ data: { orgId: ORG, name: "Inactive Scout", group: "Scouts", active: false } });
  await prisma.person.create({ data: { orgId: ORG, name: "Taiko Player", group: "Taiko" } });
  await prisma.person.create({ data: { orgId: ORG, name: "No Group", group: null } });

  await runBackfill();

  expect(await prisma.group.count({ where: { orgId: ORG } })).toBe(2); // Scouts, Taiko
  const scouts = await prisma.group.findUniqueOrThrow({ where: { orgId_name: { orgId: ORG, name: "Scouts" } } });
  const members = await prisma.membership.findMany({ where: { groupId: scouts.id }, include: { person: true } });
  expect(members).toHaveLength(2); // active AND inactive
  expect(members.find((m) => m.person.name === "Active Scout")!.subGroup).toBe("Fox");
  const ungrouped = await prisma.person.findFirstOrThrow({ where: { name: "No Group" } });
  expect(await prisma.membership.count({ where: { personId: ungrouped.id } })).toBe(0);

  await runBackfill(); // second run changes nothing
  expect(await prisma.group.count({ where: { orgId: ORG } })).toBe(2);
  expect(await prisma.membership.count()).toBe(3);
});
