// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import {
  getEventBoard, listPublishedEvents,
  generateUniqueSlug, getEventBoardByParam, getEventParam, updateEventSlug,
} from "@/lib/repository/events";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

const dates = { startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26"), orgId: "org_bcsf" };

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
  test("includes each event's slug for building links", async () => {
    await prisma.event.create({ data: { name: "Ginza", slug: "ginza-2026", status: "published", ...dates } });
    const list = await listPublishedEvents();
    expect(list[0].slug).toBe("ginza-2026");
  });
});

describe("generateUniqueSlug", () => {
  test("derives a slug from the name", async () => {
    expect(await generateUniqueSlug("Ginza Bazaar")).toBe("ginza-bazaar");
  });
  test("suffixes to dodge a taken slug", async () => {
    await prisma.event.create({ data: { name: "X", slug: "ginza-bazaar", ...dates } });
    expect(await generateUniqueSlug("Ginza Bazaar")).toBe("ginza-bazaar-2");
  });
  test("avoids reserved words", async () => {
    expect(await generateUniqueSlug("Organize")).toBe("organize-2");
  });
});

describe("getEventBoardByParam", () => {
  test("resolves a published event by slug", async () => {
    const e = await prisma.event.create({ data: { name: "Ginza", slug: "ginza-2026", status: "published", ...dates } });
    await prisma.task.create({ data: { eventId: e.id, title: "Games", position: 1024 } });
    const board = await getEventBoardByParam("ginza-2026");
    expect(board!.name).toBe("Ginza");
    expect(board!.tasks.map((t) => t.title)).toEqual(["Games"]);
  });
  test("also resolves by id (back-compat), and null for drafts or misses", async () => {
    const e = await prisma.event.create({ data: { name: "Ginza", slug: "ginza-2026", status: "published", ...dates } });
    expect((await getEventBoardByParam(e.id))!.name).toBe("Ginza");
    expect(await getEventBoardByParam("nope")).toBeNull();
    await prisma.event.create({ data: { name: "D", slug: "draft-one", status: "draft", ...dates } });
    expect(await getEventBoardByParam("draft-one")).toBeNull();
  });
  test("never serves another org's board for a shared slug", async () => {
    const other = await prisma.organization.upsert({
      where: { slug: "other" }, update: {}, create: { name: "Other", slug: "other" },
    });
    // Create the other org's event first, so an unscoped findFirst would return it.
    await prisma.event.create({
      data: { name: "Theirs", slug: "shared", status: "published", startDate: dates.startDate, endDate: dates.endDate, orgId: other.id },
    });
    await prisma.event.create({ data: { name: "Ours", slug: "shared", status: "published", ...dates } });
    expect((await getEventBoardByParam("shared"))!.name).toBe("Ours");
  });
});

describe("getEventParam", () => {
  test("returns the slug for a published event, else the id, else null", async () => {
    const withSlug = await prisma.event.create({ data: { name: "A", slug: "a-2026", status: "published", ...dates } });
    expect(await getEventParam(withSlug.id)).toBe("a-2026");
    const noSlug = await prisma.event.create({ data: { name: "B", status: "published", ...dates } });
    expect(await getEventParam(noSlug.id)).toBe(noSlug.id);
    expect(await getEventParam("missing")).toBeNull();
  });
});

describe("updateEventSlug", () => {
  test("sets a normalized, unique slug", async () => {
    const e = await prisma.event.create({ data: { name: "A", status: "published", ...dates } });
    expect(await updateEventSlug(e.id, "Ginza 2026")).toEqual({ ok: true, slug: "ginza-2026" });
    expect((await prisma.event.findUnique({ where: { id: e.id } }))!.slug).toBe("ginza-2026");
  });
  test("rejects a reserved or already-taken slug", async () => {
    await prisma.event.create({ data: { name: "A", slug: "taken", status: "published", ...dates } });
    const b = await prisma.event.create({ data: { name: "B", status: "published", ...dates } });
    expect(await updateEventSlug(b.id, "organize")).toEqual({ ok: false, error: expect.stringContaining("reserved") });
    expect(await updateEventSlug(b.id, "taken")).toEqual({ ok: false, error: expect.stringContaining("taken") });
  });
  test("lets an event keep its own slug (no false self-collision)", async () => {
    const e = await prisma.event.create({ data: { name: "A", slug: "ginza-2026", status: "published", ...dates } });
    expect(await updateEventSlug(e.id, "ginza-2026")).toEqual({ ok: true, slug: "ginza-2026" });
  });
});
