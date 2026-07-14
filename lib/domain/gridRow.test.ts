import { describe, expect, test } from "vitest";
import { parseRow, taskToCells, emptyCells, type RawCells } from "@/lib/domain/gridRow";
import type { EventCtx } from "@/lib/domain/cells";

const ctx: EventCtx = { year: 2026, start: { year: 2026, month: 7, day: 24 }, end: { year: 2026, month: 7, day: 26 } };

function cells(overrides: Partial<RawCells>): RawCells {
  return { ...emptyCells(), ...overrides };
}

describe("parseRow", () => {
  test("full shift row parses to repository fields", () => {
    const r = parseRow(cells({
      title: "Games", kind: "shift", date: "Jul 25", need: "5",
      time: "10:00 AM - 1:00 PM", category: "Games", group: "Scouts",
      location: "Inside Gym", description: "Run the booth", definitionOfDone: "Tidy at handover",
      pointOfContact: "Yumi",
    }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      title: "Games", kind: "shift", neededCount: 5, category: "Games",
      requestedGroup: "Scouts", location: "Inside Gym", description: "Run the booth",
    });
    expect(r.value.startAt?.toISOString()).toBe("2026-07-25T17:00:00.000Z");
  });
  test("empty title is invalid", () => {
    const r = parseRow(cells({ title: "  " }), ctx);
    expect(r).toEqual({ ok: false, field: "title", error: "Every task needs a title." });
  });
  test("bad need reports its field", () => {
    const r = parseRow(cells({ title: "X", need: "lots" }), ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe("need");
  });
  test("blank optionals become null", () => {
    const r = parseRow(cells({ title: "X" }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.category).toBeNull();
    expect(r.value.date).toBeNull();
  });
});

describe("parseRow length caps", () => {
  test("rejects an over-long title", () => {
    const r = parseRow(cells({ title: "x".repeat(201) }), ctx);
    expect(r).toEqual({ ok: false, field: "title", error: "Title is too long (200 max)." });
  });
  test("rejects an over-long description", () => {
    const r = parseRow(cells({ title: "OK", description: "x".repeat(5001) }), ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe("description");
  });
});

describe("taskToCells round-trip", () => {
  test("a stored shift renders back to editable strings that re-parse identically", () => {
    const stored = {
      title: "Games", kind: "shift" as const, category: "Games", requestedGroup: "Scouts",
      neededCount: 5, date: new Date("2026-07-25T00:00:00Z"),
      startAt: new Date("2026-07-25T17:00:00Z"), endAt: new Date("2026-07-25T20:00:00Z"),
      dueBy: null, location: "Inside Gym", description: null, definitionOfDone: null, pointOfContact: null,
    };
    const c = taskToCells(stored);
    expect(c.date).toBe("Jul 25");
    expect(c.time).toBe("10:00 AM–1:00 PM");
    const r = parseRow(c, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.startAt?.toISOString()).toBe("2026-07-25T17:00:00.000Z");
    expect(r.value.endAt?.toISOString()).toBe("2026-07-25T20:00:00.000Z");
  });
  test("a stored frog renders a 'by …' cell", () => {
    const c = taskToCells({
      title: "Cups", kind: "mission", category: null, requestedGroup: null, neededCount: 1,
      date: null, startAt: null, endAt: null, dueBy: new Date("2026-07-25T17:00:00Z"),
      location: null, description: null, definitionOfDone: null, pointOfContact: null,
    });
    expect(c.time).toBe("by Jul 25 10:00 AM");
    const ctx2 = { year: 2026, start: { year: 2026, month: 7, day: 24 }, end: { year: 2026, month: 7, day: 26 } };
    const r = parseRow(c, ctx2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dueBy?.toISOString()).toBe("2026-07-25T17:00:00.000Z");
  });
});
