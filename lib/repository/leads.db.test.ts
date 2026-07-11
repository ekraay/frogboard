// @vitest-environment node
import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { createLead, removeLead, regenerateLeadToken, getEventLeads, getLeadAuth } from "@/lib/repository/leads";

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
  const rolled = await regenerateLeadToken(lead.id);
  expect(rolled!.token).not.toBe(lead.token);
  expect(await removeLead(lead.id)).toBe(true);
  expect(await removeLead("missing")).toBe(false);
  expect(await regenerateLeadToken("missing")).toBeNull();
});

test("getLeadAuth resolves scope, null on bad token", async () => {
  const e = await event();
  const lead = await createLead(e.id, "Scouts", "Simon");
  expect(await getLeadAuth(lead.token)).toEqual({ eventId: e.id, orgId: ORG, group: "Scouts" });
  expect(await getLeadAuth("nope")).toBeNull();
});
