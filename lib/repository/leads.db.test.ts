// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { createLead, removeLead, regenerateLeadToken, getEventLeads, getLeadAuth, getLeadRosterView } from "@/lib/repository/leads";
import { importPeople } from "@/lib/repository/directory";
import { setRsvp } from "@/lib/repository/rsvp";

const ORG = "org_bcsf";
async function event() {
  return prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

test("createLead mints a token and carries the org", async () => {
  const e = await event();
  const lead = await createLead(e.id, "Scouts", "Simon");
  expect(lead.token).toBeTruthy();
  expect(lead.orgId).toBe(ORG);
  expect((await getEventLeads(e.id)).map((l) => l.name)).toEqual(["Simon"]);
});

test("multiple leads per group are allowed", async () => {
  const e = await event();
  await createLead(e.id, "Scouts", "Simon");
  await createLead(e.id, "Scouts", "Naoto");
  expect(await prisma.lead.count({ where: { eventId: e.id, group: "Scouts" } })).toBe(2);
});

test("removeLead and regenerateLeadToken revoke the link", async () => {
  const e = await event();
  const lead = await createLead(e.id, "Scouts", "Simon");
  const rolled = await regenerateLeadToken(lead.id, e.id);
  expect(rolled!.token).not.toBe(lead.token);
  expect(await removeLead(lead.id, e.id)).toBe(true);
  expect(await removeLead("missing", e.id)).toBe(false);
  expect(await regenerateLeadToken("missing", e.id)).toBeNull();
});

test("getLeadAuth resolves scope, null on bad token", async () => {
  const e = await event();
  const lead = await createLead(e.id, "Scouts", "Simon");
  expect(await getLeadAuth(lead.token)).toEqual({ eventId: e.id, orgId: ORG, group: "Scouts" });
  expect(await getLeadAuth("nope")).toBeNull();
});

describe("getLeadRosterView", () => {
  test("shows the whole group, abbreviated, answered people kept with their status", async () => {
    const e = await event();
    await importPeople(ORG, "Scouts", [
      { name: "Alex Tanaka", subGroup: "Hawk", position: null, externalId: "1" },
      { name: "Bo Smith", subGroup: "Hawk", position: null, externalId: "2" },
    ], { minor: true });
    const bo = await prisma.person.findFirst({ where: { name: "Bo Smith" } });
    await setRsvp(bo!.id, e.id, "yes", null);
    const lead = await createLead(e.id, "Scouts", "Simon");
    const view = await getLeadRosterView(lead.token);
    expect(view!.group).toBe("Scouts");
    expect(view!.eventName).toBe("Obon");
    expect(view!.counts).toEqual({ yes: 1, maybe: 0, no: 0, blank: 1 });
    const hawk = view!.roster.find((g) => g.subGroup === "Hawk")!;
    expect(hawk.people.map((p) => p.name)).toEqual(["Alex T.", "Bo S."]); // blank first, both kept
    expect(hawk.people.find((p) => p.name === "Bo S.")!.status).toBe("yes");
  });
  test("summarizes each patrol with counts and names the patrol leader", async () => {
    const e = await event();
    await importPeople(ORG, "Scouts", [
      { name: "Alex Tanaka", subGroup: "Hawk", position: "PL", externalId: "1" },
      { name: "Bo Smith", subGroup: "Hawk", position: null, externalId: "2" },
    ], { minor: true });
    const bo = await prisma.person.findFirst({ where: { name: "Bo Smith" } });
    await setRsvp(bo!.id, e.id, "no", null);
    const lead = await createLead(e.id, "Scouts", "Simon");
    const view = await getLeadRosterView(lead.token);
    const hawk = view!.byPatrol.find((p) => p.subGroup === "Hawk")!;
    expect(hawk.counts).toEqual({ yes: 0, maybe: 0, no: 1, blank: 1 });
    expect(hawk.leader).toBe("Alex T.");
  });
  test("shows a maybe person's reason on the roster row", async () => {
    const e = await event();
    await importPeople(ORG, "Scouts", [
      { name: "Cara Ito", subGroup: "Hawk", position: null, externalId: "9" },
    ], { minor: true });
    const cara = await prisma.person.findFirst({ where: { name: "Cara Ito" } });
    await setRsvp(cara!.id, e.id, "maybe", "Might have a game");
    const lead = await createLead(e.id, "Scouts", "Simon");
    const view = await getLeadRosterView(lead.token);
    const row = view!.roster.flatMap((g) => g.people).find((p) => p.id === cara!.id)!;
    expect(row.reason).toBe("Might have a game");
  });
  test("shows each person's position on the roster row", async () => {
    const e = await event();
    await importPeople(ORG, "Scouts", [
      { name: "Alex Tanaka", subGroup: "Hawk", position: "PL", externalId: "1" },
    ], { minor: true });
    const lead = await createLead(e.id, "Scouts", "Simon");
    const view = await getLeadRosterView(lead.token);
    const row = view!.roster.flatMap((g) => g.people).find((p) => p.name === "Alex T.")!;
    expect(row.position).toBe("PL");
  });
  test("null on an unknown token", async () => {
    expect(await getLeadRosterView("nope")).toBeNull();
  });
});
