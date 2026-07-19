// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { hashExternalId } from "@/lib/security/hash";
import { importPeople, getGroupRollups } from "@/lib/repository/directory";
import { resolveGroupId } from "@/lib/repository/groups";
import { setRsvp } from "@/lib/repository/rsvp";

const ORG = "org_bcsf";
const ORG_OTHER = "org_other";

beforeEach(async () => { await resetDb(); });
afterEach(async () => {
  // resetDb() doesn't touch Organization, so drop the second org here to keep
  // the test database clean for other test files that assume only org_bcsf.
  await prisma.organization.deleteMany({ where: { NOT: { id: ORG } } });
});
afterAll(async () => { await prisma.$disconnect(); });

describe("importPeople", () => {
  test("creates people, hashing the external id (never storing it raw)", async () => {
    const res = await importPeople(ORG, "Scouts", [
      { name: "Simon Kraay", subGroup: null, position: "SPL", externalId: "135291163" },
      { name: "Naoto Thompson", subGroup: "Hawk", position: "PL", externalId: "135684307" },
    ], { minor: true });
    expect(res).toEqual({ created: 2, updated: 0 });
    const simon = await prisma.person.findFirst({ where: { orgId: ORG, name: "Simon Kraay" } });
    expect(simon!.externalIdHash).toBe(hashExternalId("135291163"));
    expect(simon!.minor).toBe(true);
    expect(simon!.group).toBe("Scouts");
  });
  test("re-import updates in place by external id hash", async () => {
    await importPeople(ORG, "Scouts", [{ name: "Old Name", subGroup: "Fox", position: null, externalId: "1" }], { minor: true });
    const res = await importPeople(ORG, "Scouts", [{ name: "New Name", subGroup: "Hawk", position: null, externalId: "1" }], { minor: true });
    expect(res).toEqual({ created: 0, updated: 1 });
    expect(await prisma.person.count({ where: { orgId: ORG } })).toBe(1);
    const p = await prisma.person.findFirst({ where: { orgId: ORG } });
    expect(p!.name).toBe("New Name");
    expect(p!.subGroup).toBe("Hawk");
  });
  test("re-importing a person into a new group moves them (one membership)", async () => {
    await importPeople(ORG, "Scouts", [{ name: "Simon", subGroup: "Fox", position: null, externalId: "1" }], { minor: false });
    await importPeople(ORG, "Taiko", [{ name: "Simon", subGroup: null, position: null, externalId: "1" }], { minor: false });
    const person = await prisma.person.findFirstOrThrow({ where: { orgId: ORG } });
    const memberships = await prisma.membership.findMany({ where: { personId: person.id }, include: { group: true } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].group.name).toBe("Taiko");
    expect(person.group).toBe("Taiko"); // dual-write kept in sync
  });
});

describe("getGroupRollups", () => {
  test("counts attendance per group for the event", async () => {
    const e = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
    await importPeople(ORG, "Scouts", [
      { name: "A A", subGroup: "Hawk", position: null, externalId: "1" },
      { name: "B B", subGroup: "Fox", position: null, externalId: "2" },
    ], { minor: true });
    const a = await prisma.person.findFirst({ where: { name: "A A" } });
    await setRsvp(a!.id, e.id, "yes", null);
    expect(await getGroupRollups(e.id)).toEqual([
      { group: "Scouts", counts: { yes: 1, maybe: 0, no: 0, blank: 1 } },
    ]);
  });
  test("a group whose members are all inactive does not appear", async () => {
    const e = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
    await importPeople(ORG, "Ghosts", [{ name: "Gone Person", subGroup: null, position: null, externalId: "g1" }], { minor: false });
    await prisma.person.updateMany({ where: { orgId: ORG, name: "Gone Person" }, data: { active: false } });
    expect(await getGroupRollups(e.id)).toEqual([]);
  });
  test("a membership linking another org's person to this org's group does not leak them in", async () => {
    const e = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
    await importPeople(ORG, "Scouts", [
      { name: "Home Person", subGroup: null, position: null, externalId: "h1" },
    ], { minor: true });

    await prisma.organization.create({ data: { id: ORG_OTHER, name: "Other", slug: "other" } });
    const outsider = await prisma.person.create({ data: { orgId: ORG_OTHER, name: "Outsider", group: "Scouts" } });
    const scoutsGroupId = await resolveGroupId(ORG, "Scouts");
    await prisma.membership.create({ data: { personId: outsider.id, groupId: scoutsGroupId! } });

    // Only Home Person (org_bcsf) counts; Outsider (org_other) must not inflate the bucket.
    expect(await getGroupRollups(e.id)).toEqual([
      { group: "Scouts", counts: { yes: 0, maybe: 0, no: 0, blank: 1 } },
    ]);
  });
});
