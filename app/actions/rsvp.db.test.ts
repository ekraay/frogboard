// @vitest-environment node
import { afterAll, beforeEach, expect, test, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { setRsvpAction } from "@/app/actions/rsvp";
import { createLead } from "@/lib/repository/leads";
import { personInGroup } from "@/test/factories";
import type { RsvpStatus } from "@/lib/domain/rsvp";

const ORG = "org_bcsf";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

async function fixture() {
  const event = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
  const scout = await personInGroup(ORG, "Scouts", { name: "Simon Kraay" });
  const baller = await personInGroup(ORG, "YAO", { name: "Ava Lin" });
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

test("rejects an out-of-range status instead of throwing a 500", async () => {
  const { scout, lead } = await fixture();
  expect(await setRsvpAction(lead.token, scout.id, "attending" as RsvpStatus, null))
    .toEqual({ ok: false, error: "Pick yes, no, or maybe." });
  expect(await prisma.rsvp.count()).toBe(0);
});

test("coerces a non-string reason to no reason", async () => {
  const { scout, lead, event } = await fixture();
  expect(await setRsvpAction(lead.token, scout.id, "no", 42 as unknown as string)).toEqual({ ok: true });
  const row = await prisma.rsvp.findFirst({ where: { personId: scout.id, eventId: event.id } });
  expect(row!.reason).toBeNull();
});

test("allows an active and an inactive member of the lead's group, refuses others", async () => {
  const event = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
  const active = await personInGroup(ORG, "Scouts", { name: "Simon Kraay" });
  const inactive = await personInGroup(ORG, "Scouts", { name: "Old Scout", active: false });
  const other = await personInGroup(ORG, "YAO", { name: "Ava Lin" });
  const lead = await createLead(event.id, "Scouts", "Simon");

  expect((await setRsvpAction(lead.token, active.id, "yes", null)).ok).toBe(true);
  expect((await setRsvpAction(lead.token, inactive.id, "no", null)).ok).toBe(true);
  expect((await setRsvpAction(lead.token, other.id, "yes", null)).ok).toBe(false);
});

test("refuses when the lead's group name resolves to no Group row (fail closed)", async () => {
  const event = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
  const person = await personInGroup(ORG, "Scouts", { name: "Simon Kraay" });
  const lead = await createLead(event.id, "Nonexistent", "Simon");

  expect((await setRsvpAction(lead.token, person.id, "yes", null)).ok).toBe(false);
  expect(await prisma.rsvp.count()).toBe(0);
});
