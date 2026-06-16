// @vitest-environment node
import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { getActiveEventBoard } from "@/lib/repository/events";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

test("a minor's last name is abbreviated on the board; the minor flag is never exposed", async () => {
  const e = await prisma.event.create({
    data: {
      name: "Ginza", status: "published",
      startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26"),
    },
  });
  const t = await prisma.task.create({ data: { eventId: e.id, title: "Games", position: 1024 } });
  await prisma.signup.create({ data: { taskId: t.id, name: "Alex Tanaka", minor: true, claimToken: "a" } });
  await prisma.signup.create({ data: { taskId: t.id, name: "Mary Jones", minor: false, claimToken: "b" } });

  const board = await getActiveEventBoard();
  const names = board!.tasks[0].signups.map((s) => s.name);
  expect(names).toContain("Alex T.");          // minor abbreviated
  expect(names).toContain("Mary Jones");        // adult in full
  expect(names).not.toContain("Alex Tanaka");   // full surname never sent
  expect(board!.tasks[0].signups.every((s) => !("minor" in s))).toBe(true);
});
