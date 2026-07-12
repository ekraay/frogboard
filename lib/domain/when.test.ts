import { describe, expect, test } from "vitest";
import { pacificToUtc, utcMidnight, combineWhen } from "@/lib/domain/when";
import type { EventCtx } from "@/lib/domain/cells";

const ctx: EventCtx = { year: 2026, start: { year: 2026, month: 7, day: 24 }, end: { year: 2026, month: 7, day: 26 } };

describe("utcMidnight", () => {
  test("renders a calendar day as its UTC midnight instant", () => {
    expect(utcMidnight({ year: 2026, month: 7, day: 25 }).toISOString()).toBe("2026-07-25T00:00:00.000Z");
  });
});

describe("pacificToUtc", () => {
  test("PDT: Jul 25 2026 10:00 → 17:00Z", () => {
    expect(pacificToUtc({ year: 2026, month: 7, day: 25 }, 600).toISOString()).toBe("2026-07-25T17:00:00.000Z");
  });
  test("PST: Jan 15 2026 10:00 → 18:00Z", () => {
    expect(pacificToUtc({ year: 2026, month: 1, day: 15 }, 600).toISOString()).toBe("2026-01-15T18:00:00.000Z");
  });
  // The 02:30 wall time doesn't exist on this night; our two-pass algorithm
  // snaps BEFORE the gap (01:30 PST = 09:30Z). Library conventions vary; either
  // side is acceptable for this domain — the contract is determinism, no crash.
  test("spring-forward gap resolves without crashing (Mar 8 2026 02:30)", () => {
    const d = pacificToUtc({ year: 2026, month: 3, day: 8 }, 150);
    expect(d.toISOString()).toMatch(/^2026-03-08T(09|10):30/);
  });
});

describe("combineWhen", () => {
  test("shift with date + range derives all three timestamps", () => {
    const r = combineWhen("shift", { year: 2026, month: 7, day: 25 }, { kind: "range", start: 600, end: 780 }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.date?.toISOString()).toBe("2026-07-25T00:00:00.000Z");
    expect(r.value.startAt?.toISOString()).toBe("2026-07-25T17:00:00.000Z");
    expect(r.value.endAt?.toISOString()).toBe("2026-07-25T20:00:00.000Z");
    expect(r.value.dueBy).toBeNull();
  });
  test("shift with date only is all-day", () => {
    const r = combineWhen("shift", { year: 2026, month: 7, day: 25 }, { kind: "none" }, ctx);
    expect(r.ok && r.value.startAt === null && r.value.date !== null).toBe(true);
  });
  test("shift with time but no date is an error", () => {
    const r = combineWhen("shift", null, { kind: "range", start: 600, end: 780 }, ctx);
    expect(r).toEqual({ ok: false, field: "date", error: "A timed shift needs a date." });
  });
  test("frog 'by Sat 10am' resolves the weekday inside the event window", () => {
    const r = combineWhen("frog", null, { kind: "dueBy", dateText: "Sat", time: 600 }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dueBy?.toISOString()).toBe("2026-07-25T17:00:00.000Z");
    expect(r.value.date).toBeNull();
  });
  test("frog 'by 3:00 PM' without a date uses the event's first day", () => {
    const r = combineWhen("frog", null, { kind: "dueBy", dateText: null, time: 900 }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dueBy?.toISOString()).toBe("2026-07-24T22:00:00.000Z");
  });
  test("frog with a plain range is an error (frogs take deadlines)", () => {
    const r = combineWhen("frog", null, { kind: "range", start: 600, end: 780 }, ctx);
    expect(r.ok).toBe(false);
  });
  test("shift with a 'by …' deadline is an error (deadlines are for frogs)", () => {
    const r = combineWhen("shift", { year: 2026, month: 7, day: 25 }, { kind: "dueBy", dateText: null, time: 600 }, ctx);
    expect(r).toEqual({ ok: false, field: "time", error: "A shift takes a time range. A 'by ...' deadline is for frogs." });
  });
  test("frog with no time cell at all is fine — an anytime frog", () => {
    const r = combineWhen("frog", null, { kind: "none" }, ctx);
    expect(r).toEqual({ ok: true, value: { date: null, startAt: null, endAt: null, dueBy: null } });
  });
  test("shift with a single start time sets startAt only", () => {
    const r = combineWhen("shift", { year: 2026, month: 7, day: 25 }, { kind: "start", start: 600 }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.startAt?.toISOString()).toBe("2026-07-25T17:00:00.000Z");
    expect(r.value.endAt).toBeNull();
  });
  test("frog with a single start time is rejected like a range", () => {
    const r = combineWhen("frog", null, { kind: "start", start: 600 }, ctx);
    expect(r.ok).toBe(false);
  });
  test("frog with a date and a bare time is a deadline at that date and time", () => {
    // the row's Date cell supplies the day; "5pm" (1020) is the deadline clock
    const r = combineWhen("frog", { year: 2026, month: 7, day: 25 }, { kind: "start", start: 1020 }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dueBy?.toISOString()).toBe("2026-07-26T00:00:00.000Z"); // 5pm PDT
    expect(r.value.date).toBeNull();
    expect(r.value.startAt).toBeNull();
  });
  test("frog with a bare time but no day asks for a due date, no em dash", () => {
    const r = combineWhen("frog", null, { kind: "start", start: 1020 }, ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe("time");
    expect(r.error).not.toContain("—");
  });
  test("frog with a date and no time is due at the end of that day", () => {
    const r = combineWhen("frog", { year: 2026, month: 7, day: 25 }, { kind: "none" }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dueBy?.toISOString()).toBe("2026-07-26T06:59:00.000Z"); // 11:59 PM PDT
  });
  test("frog error messages carry no em dash", () => {
    const range = combineWhen("frog", null, { kind: "range", start: 600, end: 780 }, ctx);
    expect(range.ok).toBe(false);
    if (range.ok) return;
    expect(range.error).not.toContain("—");
  });
});
