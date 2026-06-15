// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import {
  createEvent, listEvents, setEventStatus, deleteEvent, getEventGrid,
  upsertTaskWithAudit, deleteTaskWithAudit, deleteTasks, renumberTasks,
} from "@/lib/repository/organize";
import type { ParsedTaskFields } from "@/lib/domain/gridRow";

function fields(overrides: Partial<ParsedTaskFields>): ParsedTaskFields {
  return {
    title: "Games", kind: "shift", category: null, requestedGroup: null, neededCount: 2,
    date: null, startAt: null, endAt: null, dueBy: null,
    location: null, description: null, definitionOfDone: null, pointOfContact: null,
    ...overrides,
  };
}

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
  test("setEventStatus flips visibility and reports success", async () => {
    const e = await createEvent("A", new Date(), new Date());
    expect(await setEventStatus(e.id, "published")).toBe(true);
    expect((await prisma.event.findUnique({ where: { id: e.id } }))!.status).toBe("published");
  });
  test("setEventStatus can archive an event", async () => {
    const e = await createEvent("A", new Date(), new Date());
    expect(await setEventStatus(e.id, "archived")).toBe(true);
    expect((await prisma.event.findUnique({ where: { id: e.id } }))!.status).toBe("archived");
  });
  test("deleteEvent removes the event and its tasks", async () => {
    const e = await createEvent("Doomed", new Date(), new Date());
    await prisma.task.create({ data: { eventId: e.id, title: "T", position: 1024 } });
    expect(await deleteEvent(e.id)).toBe(true);
    expect(await prisma.event.findUnique({ where: { id: e.id } })).toBeNull();
    expect(await prisma.task.count({ where: { eventId: e.id } })).toBe(0);
  });
  test("deleteEvent on a missing event reports failure", async () => {
    expect(await deleteEvent("not-real")).toBe(false);
  });
  test("setEventStatus on a missing event reports failure instead of throwing", async () => {
    expect(await setEventStatus("nope-not-real", "published")).toBe(false);
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

describe("upsertTaskWithAudit", () => {
  test("create assigns a position after the last and logs 'create'", async () => {
    const e = await createEvent("A", new Date(), new Date());
    await prisma.task.create({ data: { eventId: e.id, title: "Existing", position: 1024 } });
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "New" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const task = await prisma.task.findUnique({ where: { id: r.taskId } });
    expect(task!.position).toBe(2048);
    const audit = await prisma.auditLog.findFirst({ where: { taskId: r.taskId } });
    expect(audit!.action).toBe("create");
  });
  test("update preserves signups and logs before/after", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "Old title" }));
    if (!r.ok) throw new Error("setup");
    await prisma.signup.create({ data: { taskId: r.taskId, name: "Kenji", claimToken: "tok" } });
    const r2 = await upsertTaskWithAudit(e.id, r.taskId, fields({ title: "New title" }));
    expect(r2.ok).toBe(true);
    expect(await prisma.signup.count({ where: { taskId: r.taskId } })).toBe(1);
    const edit = await prisma.auditLog.findFirst({ where: { taskId: r.taskId, action: "edit" } });
    expect((edit!.details as { before: { title: string } }).before.title).toBe("Old title");
  });
  test("refuses to drop needed below current signups", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ neededCount: 2 }));
    if (!r.ok) throw new Error("setup");
    await prisma.signup.createMany({ data: [
      { taskId: r.taskId, name: "A", claimToken: "t1" },
      { taskId: r.taskId, name: "B", claimToken: "t2" },
    ]});
    const r2 = await upsertTaskWithAudit(e.id, r.taskId, fields({ neededCount: 1 }));
    expect(r2).toEqual({ ok: false, field: "need", error: "2 already signed up — needed can't go below that." });
  });
});

describe("deleteTaskWithAudit", () => {
  test("deletes and snapshots the task including its signups", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "Doomed" }));
    if (!r.ok) throw new Error("setup");
    await prisma.signup.create({ data: { taskId: r.taskId, name: "Kenji", claimToken: "tok" } });
    const del = await deleteTaskWithAudit(r.taskId);
    expect(del).toEqual({ ok: true });
    expect(await prisma.task.count()).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { action: "delete" } });
    const details = log!.details as { task: { title: string }; signups: { name: string }[] };
    expect(details.task.title).toBe("Doomed");
    expect(details.signups.map((s) => s.name)).toEqual(["Kenji"]);
  });
  test("the delete audit row outlives the task (SetNull, not Cascade)", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "Doomed" }));
    if (!r.ok) throw new Error("setup");
    await deleteTaskWithAudit(r.taskId);
    // ALL audit rows for the deleted task survive, detached from it:
    const logs = await prisma.auditLog.findMany({ where: { eventId: e.id } });
    expect(logs.map((l) => l.action).sort()).toEqual(["create", "delete"]);
    expect(logs.every((l) => l.taskId === null)).toBe(true);
    expect(logs.every((l) => l.eventId === e.id)).toBe(true);
  });
});

describe("deleteTasks", () => {
  test("deletes only the listed tasks in the event and reports the count", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const a = await prisma.task.create({ data: { eventId: e.id, title: "A", position: 1024 } });
    const b = await prisma.task.create({ data: { eventId: e.id, title: "B", position: 2048 } });
    await prisma.task.create({ data: { eventId: e.id, title: "C", position: 3072 } });
    expect(await deleteTasks(e.id, [a.id, b.id])).toBe(2);
    const left = await prisma.task.findMany({ where: { eventId: e.id } });
    expect(left.map((t) => t.title)).toEqual(["C"]);
  });
  test("never reaches across events — a foreign id is left alone", async () => {
    const e1 = await createEvent("One", new Date(), new Date());
    const e2 = await createEvent("Two", new Date(), new Date());
    const mine = await prisma.task.create({ data: { eventId: e1.id, title: "Mine", position: 1024 } });
    const theirs = await prisma.task.create({ data: { eventId: e2.id, title: "Theirs", position: 1024 } });
    expect(await deleteTasks(e1.id, [mine.id, theirs.id])).toBe(1);
    expect(await prisma.task.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });
  test("cascades signups away with the task", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const t = await prisma.task.create({ data: { eventId: e.id, title: "T", position: 1024 } });
    await prisma.signup.create({ data: { taskId: t.id, name: "Kenji", claimToken: "tok" } });
    await deleteTasks(e.id, [t.id]);
    expect(await prisma.signup.count()).toBe(0);
  });
  test("an empty id list is a no-op", async () => {
    const e = await createEvent("A", new Date(), new Date());
    await prisma.task.create({ data: { eventId: e.id, title: "T", position: 1024 } });
    expect(await deleteTasks(e.id, [])).toBe(0);
    expect(await prisma.task.count()).toBe(1);
  });
});

describe("renumberTasks", () => {
  test("applies the given order as 1024-spaced positions and logs moves", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const a = await prisma.task.create({ data: { eventId: e.id, title: "A", position: 1024 } });
    const b = await prisma.task.create({ data: { eventId: e.id, title: "B", position: 2048 } });
    const r = await renumberTasks(e.id, [b.id, a.id]);
    expect(r.ok).toBe(true);
    expect((await prisma.task.findUnique({ where: { id: b.id } }))!.position).toBe(1024);
    expect((await prisma.task.findUnique({ where: { id: a.id } }))!.position).toBe(2048);
    expect(await prisma.auditLog.count({ where: { action: "move" } })).toBe(2);
  });
});
