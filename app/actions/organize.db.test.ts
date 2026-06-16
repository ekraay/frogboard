// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));

import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { sessionToken, SESSION_COOKIE } from "@/lib/security/session";
import {
  signIn, signOut, createEventAction, setEventStatusAction, deleteEventAction,
  saveTask, deleteTask, clearTasks, reorderTasks,
} from "@/app/actions/organize";
import { emptyCells } from "@/lib/domain/gridRow";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
  vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42");
});
afterAll(async () => { await prisma.$disconnect(); });

function authenticate() { cookieJar.set(SESSION_COOKIE, sessionToken()); }

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("signIn", () => {
  test("sets the session cookie on the right password", async () => {
    const r = await signIn(fd({ password: "lily-pad-42" }));
    expect(r).toEqual({ ok: true });
    expect(cookieJar.get(SESSION_COOKIE)).toBe(sessionToken());
  });
  test("rejects a wrong password without setting a cookie", async () => {
    const r = await signIn(fd({ password: "wrong" }));
    expect(r).toEqual({ ok: false, error: "That password doesn't match." });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });
  test("signOut clears the session cookie", async () => {
    authenticate();
    await signOut();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("auth gate", () => {
  test("organize actions refuse without a session", async () => {
    const r = await createEventAction(fd({ name: "X", startDate: "2026-08-01", endDate: "2026-08-02" }));
    expect(r).toEqual({ ok: false, error: "Please sign in." });
  });
});

describe("createEventAction + setEventStatusAction", () => {
  test("creates a draft then opens sign-ups", async () => {
    authenticate();
    const r = await createEventAction(fd({ name: "Crab Feed", startDate: "2027-02-01", endDate: "2027-02-01" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const open = await setEventStatusAction(r.eventId, "published");
    expect(open).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: r.eventId } }))!.status).toBe("published");
  });
  test("rejects a blank name", async () => {
    authenticate();
    const r = await createEventAction(fd({ name: "  ", startDate: "2027-02-01", endDate: "2027-02-01" }));
    expect(r).toEqual({ ok: false, error: "Give the event a name." });
  });
  test("reports a vanished event instead of pretending", async () => {
    authenticate();
    const r = await setEventStatusAction("nope-not-real", "published");
    expect(r).toEqual({ ok: false, error: "That event no longer exists." });
  });
  test("accepts forgiving typed dates (e.g. 9/25, no year)", async () => {
    authenticate();
    const r = await createEventAction(fd({ name: "Bazaar", startDate: "9/25", endDate: "9/27" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = (await prisma.event.findUnique({ where: { id: r.eventId } }))!;
    expect(e.startDate.getUTCMonth()).toBe(8); // September
    expect(e.endDate.getUTCDate()).toBe(27);
  });
  test("rejects an end before the start with a clear, field-tagged message", async () => {
    authenticate();
    const r = await createEventAction(fd({ name: "Backwards", startDate: "9/27/2026", endDate: "9/25/2026" }));
    expect(r).toEqual({ ok: false, field: "endDate", error: "The last day can't be before the first." });
  });
  test("can archive an event", async () => {
    authenticate();
    const e = await prisma.event.create({ data: { name: "E", startDate: new Date(), endDate: new Date() } });
    expect(await setEventStatusAction(e.id, "archived")).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: e.id } }))!.status).toBe("archived");
  });
});

describe("deleteEventAction", () => {
  test("refuses without a session", async () => {
    const e = await prisma.event.create({ data: { name: "E", startDate: new Date(), endDate: new Date() } });
    expect(await deleteEventAction(e.id)).toEqual({ ok: false, error: "Please sign in." });
    expect(await prisma.event.count()).toBe(1); // untouched
  });
  test("permanently deletes when signed in", async () => {
    authenticate();
    const e = await prisma.event.create({ data: { name: "E", startDate: new Date(), endDate: new Date() } });
    expect(await deleteEventAction(e.id)).toEqual({ ok: true });
    expect(await prisma.event.count()).toBe(0);
  });
  test("reports a vanished event", async () => {
    authenticate();
    expect(await deleteEventAction("nope")).toEqual({ ok: false, error: "That event no longer exists." });
  });
});

describe("saveTask", () => {
  test("creates a task from raw cells (server-side authoritative parse)", async () => {
    authenticate();
    const e = await prisma.event.create({
      data: { name: "E", startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26") },
    });
    const r = await saveTask({
      eventId: e.id, taskId: null,
      cells: { ...emptyCells(), title: "Games", date: "Jul 25", time: "10:00 AM - 1:00 PM", need: "5" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const task = await prisma.task.findUnique({ where: { id: r.taskId } });
    expect(task!.startAt!.toISOString()).toBe("2026-07-25T17:00:00.000Z");
    expect(task!.neededCount).toBe(5);
  });
  test("returns the parse problem and its field", async () => {
    authenticate();
    const e = await prisma.event.create({
      data: { name: "E", startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26") },
    });
    const r = await saveTask({ eventId: e.id, taskId: null, cells: { ...emptyCells(), title: "X", need: "lots" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe("need");
  });
});

describe("clearTasks", () => {
  test("refuses without a session and leaves the tasks", async () => {
    const e = await prisma.event.create({ data: { name: "E", startDate: new Date(), endDate: new Date() } });
    const t = await prisma.task.create({ data: { eventId: e.id, title: "T", position: 1024 } });
    expect(await clearTasks(e.id, [t.id])).toEqual({ ok: false, error: "Please sign in." });
    expect(await prisma.task.count()).toBe(1);
  });
  test("clears the listed tasks when signed in and reports the count", async () => {
    authenticate();
    const e = await prisma.event.create({ data: { name: "E", startDate: new Date(), endDate: new Date() } });
    const a = await prisma.task.create({ data: { eventId: e.id, title: "A", position: 1024 } });
    const b = await prisma.task.create({ data: { eventId: e.id, title: "B", position: 2048 } });
    expect(await clearTasks(e.id, [a.id, b.id])).toEqual({ ok: true, count: 2 });
    expect(await prisma.task.count({ where: { eventId: e.id } })).toBe(0);
  });
  test("never reaches across events", async () => {
    authenticate();
    const e1 = await prisma.event.create({ data: { name: "One", startDate: new Date(), endDate: new Date() } });
    const e2 = await prisma.event.create({ data: { name: "Two", startDate: new Date(), endDate: new Date() } });
    const theirs = await prisma.task.create({ data: { eventId: e2.id, title: "Theirs", position: 1024 } });
    expect(await clearTasks(e1.id, [theirs.id])).toEqual({ ok: true, count: 0 });
    expect(await prisma.task.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });
});

describe("deleteTask + reorderTasks", () => {
  test("full lifecycle", async () => {
    authenticate();
    const e = await prisma.event.create({
      data: { name: "E", startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26") },
    });
    const a = await saveTask({ eventId: e.id, taskId: null, cells: { ...emptyCells(), title: "A" } });
    const b = await saveTask({ eventId: e.id, taskId: null, cells: { ...emptyCells(), title: "B" } });
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(await reorderTasks(e.id, [b.taskId, a.taskId])).toEqual({ ok: true });
    expect(await deleteTask(a.taskId)).toEqual({ ok: true });
    expect(await prisma.task.count()).toBe(1);
  });
});
