// @vitest-environment node
import { afterAll, beforeEach, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { claimSlot, releaseSignup } from "@/app/actions/signups";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

async function seedTask(): Promise<string> {
  const event = await prisma.event.create({
    data: { name: "E", startDate: new Date(), endDate: new Date(), orgId: "org_bcsf" },
  });
  const task = await prisma.task.create({
    data: { eventId: event.id, title: "Games", neededCount: 2 },
  });
  return task.id;
}

test("claimSlot persists a signup and returns its token", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "Kenji");
  fd.set("group", "Scouts");
  fd.set("phone", "555-0100");

  const result = await claimSlot(fd);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.signupId).toBeTruthy();
  expect(result.claimToken).toBeTruthy();
  const signups = await prisma.signup.findMany({ where: { taskId } });
  expect(signups.map((s) => s.name)).toEqual(["Kenji"]);
});

test("claimSlot returns an error for a blank name", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "   ");
  expect(await claimSlot(fd)).toEqual({ ok: false, error: "Please enter a name." });
});

test("claimSlot silently rejects a filled honeypot", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "Kenji");
  fd.set("website", "http://spam.example"); // honeypot field
  expect(await claimSlot(fd)).toEqual({ ok: false, error: "Could not submit. Please try again." });
  expect(await prisma.signup.count({ where: { taskId } })).toBe(0);
});

test("releaseSignup removes a signup when the token matches", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "Kenji");
  fd.set("phone", "555-0100");
  const claim = await claimSlot(fd);
  expect(claim.ok).toBe(true);
  if (!claim.ok) return;

  const result = await releaseSignup(claim.signupId, claim.claimToken);
  expect(result).toEqual({ ok: true });
  expect(await prisma.signup.count({ where: { taskId } })).toBe(0);
});
