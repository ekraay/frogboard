// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { hashExternalId } from "@/lib/security/hash";
import { importPeople, getGroupRollups } from "@/lib/repository/directory";
import { setRsvp } from "@/lib/repository/rsvp";

const ORG = "org_bcsf";

beforeEach(async () => { await resetDb(); });
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
});
