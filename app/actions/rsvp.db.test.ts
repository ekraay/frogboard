// @vitest-environment node
import { afterAll, beforeEach, expect, test, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { setRsvpAction } from "@/app/actions/rsvp";
import { createLead } from "@/lib/repository/leads";

const ORG = "org_bcsf";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

async function fixture() {
  const event = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
  const scout = await prisma.person.create({ data: { orgId: ORG, name: "Simon Kraay", group: "Scouts" } });
  const baller = await prisma.person.create({ data: { orgId: ORG, name: "Ava Lin", group: "YAO" } });
  const lead = await createLead(event.id, "Scouts", "Simon");
  return { event, scout, baller, lead };
}

test("a valid lead token records an answer for its own group", async () => {
  const { scout, lead, event } = await fixture();
  expect(await setRsvpAction(lead.token, scout.id, "no", "Out of town")).toEqual({ ok: true });
  const row = await prisma.rsvp.findFirst({ where: { personId: scout.id, eventId: event.id } });
  expect(row!.status).toBe("no");
  expect(row!.reason).toBe("Out of town");
});

test("rejects an unknown token", async () => {
  const { scout } = await fixture();
  expect(await setRsvpAction("nope", scout.id, "yes", null)).toEqual({ ok: false, error: "This link isn't valid." });
});

test("rejects writing to a person in another group", async () => {
  const { baller, lead } = await fixture();
  expect(await setRsvpAction(lead.token, baller.id, "yes", null)).toEqual({ ok: false, error: "That person isn't in your group." });
  expect(await prisma.rsvp.count()).toBe(0);
});
