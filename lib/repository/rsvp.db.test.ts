// @vitest-environment node
import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { setRsvp, getEventRsvps } from "@/lib/repository/rsvp";

const ORG = "org_bcsf";

async function fixture() {
  const event = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
  const person = await prisma.person.create({ data: { orgId: ORG, name: "Simon Kraay", group: "Scouts" } });
  return { event, person };
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

test("setRsvp creates then updates the single whole-event row", async () => {
  const { event, person } = await fixture();
  await setRsvp(person.id, event.id, "no", "Out of town");
  await setRsvp(person.id, event.id, "yes", null);
  const rows = await prisma.rsvp.findMany({ where: { eventId: event.id, personId: person.id } });
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("yes");
  expect(rows[0].reason).toBeNull();
  expect(rows[0].day).toBeNull();
});

test("the partial unique index rejects a second whole-event row", async () => {
  const { event, person } = await fixture();
  await prisma.rsvp.create({ data: { personId: person.id, eventId: event.id, day: null, status: "yes" } });
  await expect(
    prisma.rsvp.create({ data: { personId: person.id, eventId: event.id, day: null, status: "no" } }),
  ).rejects.toMatchObject({ code: "P2002" });
});

test("getEventRsvps returns each person's rows with reason", async () => {
  const { event, person } = await fixture();
  await setRsvp(person.id, event.id, "maybe", "Maybe if practice ends early");
  expect(await getEventRsvps(event.id)).toEqual([
    { personId: person.id, day: null, status: "maybe", reason: "Maybe if practice ends early" },
  ]);
});
