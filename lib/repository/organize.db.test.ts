// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import {
  createEvent, listEvents, setEventStatus, deleteEvent, getEventGrid,
  upsertTaskWithAudit, deleteTaskWithAudit, deleteTasks, renumberTasks,
  getEventHistory, revertAuditEntry, createStandingBoard, listStandingBoards,
  getEventSignups,
} from "@/lib/repository/organize";
import { listPublishedEvents } from "@/lib/repository/events";
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
  test("createEvent assigns a slug from the name", async () => {
    const e = await createEvent("Ginza Bazaar", new Date(), new Date());
    expect(e.slug).toBe("ginza-bazaar");
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
  test("snapshots each signup's claim token so revert can restore ownership", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "Doomed" }));
    if (!r.ok) throw new Error("setup");
    await prisma.signup.create({ data: { taskId: r.taskId, name: "Kenji", claimToken: "tok-123" } });
    await deleteTaskWithAudit(r.taskId);
    const log = await prisma.auditLog.findFirst({ where: { action: "delete" } });
    const details = log!.details as { signups: { name: string; claimToken: string }[] };
    expect(details.signups[0]).toMatchObject({ name: "Kenji", claimToken: "tok-123" });
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

describe("audit actor (soft identity)", () => {
  test("create/edit/delete stamp the organizer's name on the audit row", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "T" }), "Aya");
    if (!r.ok) throw new Error("setup");
    expect((await prisma.auditLog.findFirst({ where: { action: "create" } }))!.actorName).toBe("Aya");

    await upsertTaskWithAudit(e.id, r.taskId, fields({ title: "T2" }), "Aya");
    expect((await prisma.auditLog.findFirst({ where: { action: "edit" } }))!.actorName).toBe("Aya");

    await deleteTaskWithAudit(r.taskId, "Kenji");
    expect((await prisma.auditLog.findFirst({ where: { action: "delete" } }))!.actorName).toBe("Kenji");
  });
  test("reorder stamps the organizer's name on move rows", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const a = await prisma.task.create({ data: { eventId: e.id, title: "A", position: 1024 } });
    const b = await prisma.task.create({ data: { eventId: e.id, title: "B", position: 2048 } });
    await renumberTasks(e.id, [b.id, a.id], "Aya");
    expect((await prisma.auditLog.findFirst({ where: { action: "move" } }))!.actorName).toBe("Aya");
  });
  test("actor name is optional and defaults to null", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "T" }));
    if (!r.ok) throw new Error("setup");
    expect((await prisma.auditLog.findFirst({ where: { action: "create" } }))!.actorName).toBeNull();
  });
});

describe("getEventHistory", () => {
  test("returns this event's audit rows newest first with who/what/when/details", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "T" }), "Aya");
    if (!r.ok) throw new Error("setup");
    await deleteTaskWithAudit(r.taskId, "Kenji");

    const history = await getEventHistory(e.id);
    expect(history.map((h) => h.action)).toEqual(["delete", "create"]);
    const [del, create] = history;
    expect(del.actorName).toBe("Kenji");
    expect(create.actorName).toBe("Aya");
    expect(del.createdAt.getTime()).toBeGreaterThanOrEqual(create.createdAt.getTime());
    expect((create.details as { after: { title: string } }).after.title).toBe("T");
  });
  test("scopes to one event and survives the task's deletion", async () => {
    const e1 = await createEvent("One", new Date(), new Date());
    const e2 = await createEvent("Two", new Date(), new Date());
    const r = await upsertTaskWithAudit(e1.id, null, fields({ title: "Mine" }), "Aya");
    if (!r.ok) throw new Error("setup");
    await upsertTaskWithAudit(e2.id, null, fields({ title: "Theirs" }), "Bo");
    await deleteTaskWithAudit(r.taskId, "Aya");

    const history = await getEventHistory(e1.id);
    expect(history.map((h) => h.action).sort()).toEqual(["create", "delete"]);
    expect(history.every((h) => h.actorName === "Aya")).toBe(true);
  });
});

describe("revertAuditEntry", () => {
  test("reverting a delete recreates the task and its signups with their tokens", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "Doomed", neededCount: 3 }), "Bo");
    if (!r.ok) throw new Error("setup");
    await prisma.signup.create({ data: { taskId: r.taskId, name: "Kenji", group: "Scouts", claimToken: "tok-1" } });
    await deleteTaskWithAudit(r.taskId, "Bo");
    const delLog = (await prisma.auditLog.findFirst({ where: { action: "delete" } }))!;

    const rev = await revertAuditEntry(delLog.id, "Aya");
    expect(rev.ok).toBe(true);
    if (!rev.ok) return;
    const task = await prisma.task.findUnique({ where: { id: rev.taskId }, include: { signups: true } });
    expect(task!.title).toBe("Doomed");
    expect(task!.neededCount).toBe(3);
    expect(task!.signups[0]).toMatchObject({ name: "Kenji", group: "Scouts", claimToken: "tok-1" });
    // the revert is itself recorded, as a create, by whoever did it
    const created = await prisma.auditLog.findFirst({ where: { taskId: rev.taskId, action: "create" } });
    expect(created!.actorName).toBe("Aya");
  });
  test("reverting an edit restores the prior field values and logs the revert", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "Original", location: "Tent" }), "Bo");
    if (!r.ok) throw new Error("setup");
    await upsertTaskWithAudit(e.id, r.taskId, fields({ title: "Changed", location: "Stage" }), "Bo");
    const editLog = (await prisma.auditLog.findFirst({ where: { action: "edit" } }))!;

    const rev = await revertAuditEntry(editLog.id, "Aya");
    expect(rev).toEqual({ ok: true, taskId: r.taskId });
    const task = await prisma.task.findUnique({ where: { id: r.taskId } });
    expect(task!.title).toBe("Original");
    expect(task!.location).toBe("Tent");
    expect(await prisma.auditLog.count({ where: { taskId: r.taskId, action: "edit" } })).toBe(2);
  });
  test("refuses to revert a reorder (not supported yet)", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const a = await prisma.task.create({ data: { eventId: e.id, title: "A", position: 1024 } });
    const b = await prisma.task.create({ data: { eventId: e.id, title: "B", position: 2048 } });
    await renumberTasks(e.id, [b.id, a.id], "Bo");
    const moveLog = (await prisma.auditLog.findFirst({ where: { action: "move" } }))!;
    expect(await revertAuditEntry(moveLog.id, "Aya"))
      .toEqual({ ok: false, error: "That kind of change can't be reverted yet." });
  });
  test("reverting an edit whose task was later deleted fails cleanly", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "X" }), "Bo");
    if (!r.ok) throw new Error("setup");
    await upsertTaskWithAudit(e.id, r.taskId, fields({ title: "Y" }), "Bo");
    const editLog = (await prisma.auditLog.findFirst({ where: { action: "edit" } }))!;
    await deleteTaskWithAudit(r.taskId, "Bo");
    expect(await revertAuditEntry(editLog.id, "Aya")).toEqual({ ok: false, error: "That task is gone." });
  });
  test("a missing audit id reports failure", async () => {
    expect(await revertAuditEntry("nope", "Aya")).toEqual({ ok: false, error: "That change is no longer here." });
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

describe("createStandingBoard", () => {
  test("creates an evergreen board with a slug and no dates", async () => {
    const board = await createStandingBoard("Temple needs");
    expect(board.standing).toBe(true);
    expect(board.startDate).toBeNull();
    expect(board.endDate).toBeNull();
    expect(board.slug).toBeTruthy();
    expect(board.status).toBe("draft");
    expect(board.orgId).toBe("org_bcsf");
  });
});

describe("standing boards stay out of the event lists", () => {
  test("listEvents and listPublishedEvents exclude standing boards", async () => {
    await prisma.event.create({
      data: { name: "Ginza", orgId: "org_bcsf", startDate: new Date(), endDate: new Date(), status: "published" },
    });
    await prisma.event.create({
      data: { name: "Temple needs", orgId: "org_bcsf", standing: true, status: "published" },
    });
    expect((await listEvents()).map((e) => e.name)).toEqual(["Ginza"]);
    expect((await listPublishedEvents()).map((e) => e.name)).toEqual(["Ginza"]);
  });

  test("listStandingBoards returns standing boards newest first, with slug and counts", async () => {
    await createEvent("Ginza", new Date(), new Date());
    const temple = await createStandingBoard("Temple needs");
    await prisma.task.create({ data: { eventId: temple.id, title: "Cups", position: 1024 } });
    await createStandingBoard("Garden care");
    const list = await listStandingBoards();
    expect(list.map((b) => b.name)).toEqual(["Garden care", "Temple needs"]);
    const found = list.find((b) => b.name === "Temple needs")!;
    expect(found.taskCount).toBe(1);
    expect(found.slug).toBeTruthy();
  });
});

describe("getEventSignups", () => {
  test("getEventSignups returns null for an unknown event", async () => {
    expect(await getEventSignups("nope")).toBeNull();
  });

  test("getEventSignups flattens signups with their task fields, this event only", async () => {
    const event = await prisma.event.create({
      data: { name: "Obon", slug: "obon-2026", orgId: "org_bcsf", startDate: new Date(), endDate: new Date() },
    });
    const other = await prisma.event.create({
      data: { name: "Other", orgId: "org_bcsf", startDate: new Date(), endDate: new Date() },
    });
    const task = await prisma.task.create({
      data: {
        eventId: event.id, title: "Games booth", kind: "shift", category: "Games",
        date: new Date("2026-07-25T00:00:00Z"), startAt: new Date("2026-07-25T20:00:00Z"),
        endAt: new Date("2026-07-25T23:00:00Z"), neededCount: 2, position: 3,
      },
    });
    const otherTask = await prisma.task.create({ data: { eventId: other.id, title: "Elsewhere" } });
    await prisma.signup.create({
      data: { taskId: task.id, name: "Kenji", email: "k@x.com", group: "Scouts", minor: true, claimToken: "t1" },
    });
    await prisma.signup.create({ data: { taskId: otherTask.id, name: "Stranger", claimToken: "t2" } });

    const result = await getEventSignups(event.id);
    expect(result).not.toBeNull();
    expect(result!.event).toEqual({ name: "Obon", slug: "obon-2026" });
    expect(result!.signups).toHaveLength(1);
    expect(result!.signups[0]).toMatchObject({
      taskTitle: "Games booth", taskKind: "shift", category: "Games", position: 3,
      name: "Kenji", email: "k@x.com", phone: null, group: "Scouts", minor: true,
    });
    expect(result!.signups[0].createdAt).toBeInstanceOf(Date);
  });
});
