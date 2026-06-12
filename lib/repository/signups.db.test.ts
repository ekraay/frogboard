// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { createSignupWithAudit, deleteSignupWithAudit } from "@/lib/repository/signups";

async function makeTaskNeeding(n: number): Promise<string> {
  const event = await prisma.event.create({
    data: { name: "Test", startDate: new Date(), endDate: new Date() },
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
