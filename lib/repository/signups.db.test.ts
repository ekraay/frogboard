// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { createSignupWithAudit, deleteSignupWithAudit, deleteSignupAsOrganizer } from "@/lib/repository/signups";

async function makeTaskNeeding(n: number): Promise<string> {
  const event = await prisma.event.create({
    data: { name: "Test", startDate: new Date(), endDate: new Date(), orgId: "org_bcsf" },
  });
  const task = await prisma.task.create({
    data: { eventId: event.id, title: "Games", neededCount: n },
  });
  return task.id;
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("createSignupWithAudit", () => {
  test("creates a signup + claim audit (with eventId) and returns a token", async () => {
    const taskId = await makeTaskNeeding(2);
    const result = await createSignupWithAudit(taskId, { name: "Kenji", group: "Scouts" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claimToken).toMatch(/[0-9a-f-]{36}/);

    const signups = await prisma.signup.findMany({ where: { taskId } });
    const audits = await prisma.auditLog.findMany({ where: { taskId } });
    expect(signups).toHaveLength(1);
    expect(signups[0].claimToken).toBe(result.claimToken);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("claim");
    expect(audits[0].eventId).toBeTruthy();
  });

  test("refuses to overfill a task", async () => {
    const taskId = await makeTaskNeeding(1);
    await createSignupWithAudit(taskId, { name: "Ann" });
    const result = await createSignupWithAudit(taskId, { name: "Bob" });
    expect(result).toEqual({ ok: false, error: "This task is already full." });
    expect(await prisma.signup.count({ where: { taskId } })).toBe(1);
  });

  test("two simultaneous claims for the last slot do not overfill", async () => {
    const taskId = await makeTaskNeeding(1);
    const [a, b] = await Promise.allSettled([
      createSignupWithAudit(taskId, { name: "Ann" }),
      createSignupWithAudit(taskId, { name: "Bob" }),
    ]);
    const oks = [a, b].filter(
      (r) => r.status === "fulfilled" && r.value.ok,
    ).length;
    expect(oks).toBe(1);
    expect(await prisma.signup.count({ where: { taskId } })).toBe(1);
  });
});

describe("deleteSignupWithAudit", () => {
  test("removes the signup and writes a release snapshot when the token matches", async () => {
    const taskId = await makeTaskNeeding(2);
    const created = await createSignupWithAudit(taskId, { name: "Kenji", email: "k@x.com" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await deleteSignupWithAudit(created.signupId, created.claimToken);
    expect(result).toEqual({ ok: true });

    expect(await prisma.signup.count({ where: { taskId } })).toBe(0);
    const release = await prisma.auditLog.findFirst({ where: { taskId, action: "release" } });
    expect(release).not.toBeNull();
    expect((release!.details as { name: string }).name).toBe("Kenji");
  });

  test("refuses to remove a signup when the token is wrong", async () => {
    const taskId = await makeTaskNeeding(2);
    const created = await createSignupWithAudit(taskId, { name: "Kenji" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await deleteSignupWithAudit(created.signupId, "wrong-token");
    expect(result).toEqual({ ok: false, error: "You can only remove your own signup." });
    expect(await prisma.signup.count({ where: { taskId } })).toBe(1);
  });
});

describe("audit actor (volunteer's own name)", () => {
  test("claim and release stamp the volunteer's name as the actor", async () => {
    const taskId = await makeTaskNeeding(2);
    const created = await createSignupWithAudit(taskId, { name: "Kenji", group: "Scouts" });
    if (!created.ok) throw new Error("setup");
    const claim = await prisma.auditLog.findFirst({ where: { taskId, action: "claim" } });
    expect(claim!.actorName).toBe("Kenji");

    await deleteSignupWithAudit(created.signupId, created.claimToken);
    const release = await prisma.auditLog.findFirst({ where: { taskId, action: "release" } });
    expect(release!.actorName).toBe("Kenji");
  });
});

test("deleteSignupAsOrganizer removes a claim without a token and reopens the frog", async () => {
  const event = await prisma.event.create({ data: { name: "Temple", orgId: "org_bcsf", standing: true } });
  const task = await prisma.task.create({ data: { eventId: event.id, kind: "frog", title: "Trim hedges", neededCount: 1, position: 1024 } });
  const signup = await prisma.signup.create({ data: { taskId: task.id, name: "Sam", claimToken: "device-token" } });

  expect(await deleteSignupAsOrganizer(signup.id)).toEqual({ ok: true });
  expect(await prisma.signup.count({ where: { taskId: task.id } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { taskId: task.id, action: "release" } })).toBe(1);
  expect(await deleteSignupAsOrganizer("missing")).toEqual({ ok: false, error: "That signup is no longer here." });
});
