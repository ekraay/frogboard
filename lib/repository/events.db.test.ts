// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { getEventBoard, listPublishedEvents } from "@/lib/repository/events";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

const dates = { startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26") };

test("a minor's last name is abbreviated on the board; the minor flag is never exposed", async () => {
  const e = await prisma.event.create({ data: { name: "Ginza", status: "published", ...dates } });
  const t = await prisma.task.create({ data: { eventId: e.id, title: "Games", position: 1024 } });
  await prisma.signup.create({ data: { taskId: t.id, name: "Alex Tanaka", minor: true, claimToken: "a" } });
  await prisma.signup.create({ data: { taskId: t.id, name: "Mary Jones", minor: false, claimToken: "b" } });

  const board = await getEventBoard(e.id);
  const names = board!.tasks[0].signups.map((s) => s.name);
  expect(names).toContain("Alex T.");          // minor abbreviated
  expect(names).toContain("Mary Jones");        // adult in full
  expect(names).not.toContain("Alex Tanaka");   // full surname never sent
  expect(board!.tasks[0].signups.every((s) => !("minor" in s))).toBe(true);
});

describe("getEventBoard", () => {
  test("returns the requested event's tasks, not just the newest published one", async () => {
    const older = await prisma.event.create({ data: { name: "Ginza", status: "published", ...dates } });
    await prisma.task.create({ data: { eventId: older.id, title: "Games", position: 1024 } });
    const newer = await prisma.event.create({ data: { name: "Bon Odori", status: "published", ...dates } });
    await prisma.task.create({ data: { eventId: newer.id, title: "Taiko", position: 1024 } });

    const board = await getEventBoard(older.id);
    expect(board!.name).toBe("Ginza");
    expect(board!.tasks.map((t) => t.title)).toEqual(["Games"]);
  });
  test("returns null for a draft, archived, or missing event", async () => {
    const draft = await prisma.event.create({ data: { name: "Draft", status: "draft", ...dates } });
    const archived = await prisma.event.create({ data: { name: "Old", status: "archived", ...dates } });
    expect(await getEventBoard(draft.id)).toBeNull();
    expect(await getEventBoard(archived.id)).toBeNull();
    expect(await getEventBoard("nope-not-real")).toBeNull();
  });
});

describe("listPublishedEvents", () => {
  test("lists only published events, newest first, with coverage counts", async () => {
    const a = await prisma.event.create({ data: { name: "A", status: "published", ...dates } });
    const full = await prisma.task.create({ data: { eventId: a.id, title: "Full", neededCount: 1, position: 1024 } });
    await prisma.signup.create({ data: { taskId: full.id, name: "X", claimToken: "t" } });
    await prisma.task.create({ data: { eventId: a.id, title: "Open", neededCount: 2, position: 2048 } });
    await prisma.event.create({ data: { name: "Draft", status: "draft", ...dates } });
    await prisma.event.create({ data: { name: "B", status: "published", ...dates } }); // newest

    const list = await listPublishedEvents();
    expect(list.map((e) => e.name)).toEqual(["B", "A"]);
    expect(list.find((e) => e.name === "A")).toMatchObject({ covered: 1, total: 2 });
    expect(list.find((e) => e.name === "B")).toMatchObject({ covered: 0, total: 0 });
  });
});
