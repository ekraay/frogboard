// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { importPeople, getGroupRollups } from "@/lib/repository/directory";
import { createLead, getLeadAuth, getLeadRosterView } from "@/lib/repository/leads";

const ORG_A = "org_bcsf";
const ORG_B = "org_test2";

async function seedOrgB() {
  await prisma.organization.upsert({
    where: { id: ORG_B },
    update: {},
    create: { id: ORG_B, name: "Second Church", slug: "second-church" },
  });
}

beforeEach(async () => {
  await resetDb();
  await seedOrgB();
});
afterEach(async () => {
  await prisma.organization.deleteMany({ where: { NOT: { id: ORG_A } } });
});
afterAll(async () => { await prisma.$disconnect(); });

describe("multi-tenant isolation", () => {
  test("an import writes people only under its own org", async () => {
    await importPeople(ORG_A, "Scouts", [{ name: "A One", subGroup: null, position: null, externalId: "a1" }], { minor: true });
    await importPeople(ORG_B, "Scouts", [{ name: "B One", subGroup: null, position: null, externalId: "b1" }], { minor: true });
    expect((await prisma.person.findMany({ where: { orgId: ORG_A } })).map((p) => p.name)).toEqual(["A One"]);
    expect((await prisma.person.findMany({ where: { orgId: ORG_B } })).map((p) => p.name)).toEqual(["B One"]);
  });

  test("getGroupRollups counts only the event's own org", async () => {
    const eventA = await prisma.event.create({ data: { name: "A Event", orgId: ORG_A, startDate: new Date(), endDate: new Date() } });
    await importPeople(ORG_A, "Scouts", [{ name: "A One", subGroup: null, position: null, externalId: "a1" }], { minor: true });
    await importPeople(ORG_B, "Scouts", [{ name: "B One", subGroup: null, position: null, externalId: "b1" }], { minor: true });
    const rollups = await getGroupRollups(eventA.id);
    // Org A has one Scouts person (blank). Org B's person must not appear in this event's rollup.
    expect(rollups).toEqual([{ group: "Scouts", counts: { yes: 0, maybe: 0, no: 0, blank: 1 } }]);
  });

  test("a lead token resolves only its own org's scope and roster", async () => {
    const eventB = await prisma.event.create({ data: { name: "B Event", orgId: ORG_B, startDate: new Date(), endDate: new Date() } });
    await importPeople(ORG_B, "Scouts", [{ name: "Bea Bee", subGroup: "Hawk", position: null, externalId: "b2" }], { minor: true });
    const leadB = await createLead(eventB.id, "Scouts", "Bianca");
    expect(await getLeadAuth(leadB.token)).toEqual({ eventId: eventB.id, orgId: ORG_B, group: "Scouts" });
    const view = await getLeadRosterView(leadB.token);
    // Only org B's person appears; org A has no bearing on this view.
    expect(view!.roster.flatMap((g) => g.people).map((p) => p.name)).toEqual(["Bea B."]);
  });
});
