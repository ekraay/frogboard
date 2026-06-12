// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import {
  createEvent, listEvents, setEventStatus, getEventGrid,
} from "@/lib/repository/organize";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("events", () => {
  test("createEvent starts as draft", async () => {
    const e = await createEvent("Ginza 2027", new Date("2027-07-24"), new Date("2027-07-26"));
    expect(e.status).toBe("draft");
    expect(e.name).toBe("Ginza 2027");
  });
  test("listEvents returns newest first with task counts", async () => {
    const a = await createEvent("A", new Date(), new Date());
    await prisma.task.create({ data: { eventId: a.id, title: "T", position: 1024 } });
    await createEvent("B", new Date(), new Date());
    const list = await listEvents();
    expect(list.map((e) => e.name)).toEqual(["B", "A"]);
    expect(list[1].taskCount).toBe(1);
  });
  test("setEventStatus flips visibility", async () => {
    const e = await createEvent("A", new Date(), new Date());
    await setEventStatus(e.id, "published");
    expect((await prisma.event.findUnique({ where: { id: e.id } }))!.status).toBe("published");
  });
  test("getEventGrid returns tasks in position order with signup counts", async () => {
    const e = await createEvent("A", new Date("2026-07-24"), new Date("2026-07-26"));
    const t2 = await prisma.task.create({ data: { eventId: e.id, title: "Second", position: 2048 } });
    await prisma.task.create({ data: { eventId: e.id, title: "First", position: 1024 } });
    await prisma.signup.create({ data: { taskId: t2.id, name: "Kenji", claimToken: "tok" } });
    const grid = await getEventGrid(e.id);
    expect(grid!.tasks.map((t) => t.title)).toEqual(["First", "Second"]);
    expect(grid!.tasks[1].signupCount).toBe(1);
  });
});
