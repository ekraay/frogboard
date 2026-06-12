import { describe, expect, test } from "vitest";
import { parseDateCell, parseTimeCell, parseNeedCell, type EventCtx } from "@/lib/domain/cells";

const ctx: EventCtx = {
  year: 2026,
  start: { year: 2026, month: 7, day: 24 },
  end: { year: 2026, month: 7, day: 26 },
};

describe("parseDateCell", () => {
  test.each([
    ["7/25", { year: 2026, month: 7, day: 25 }],
    ["7/25/2026", { year: 2026, month: 7, day: 25 }],
    ["Jul 25", { year: 2026, month: 7, day: 25 }],
    ["July 25", { year: 2026, month: 7, day: 25 }],
    ["Sat Jul 25", { year: 2026, month: 7, day: 25 }],
    ["Saturday, July 25", { year: 2026, month: 7, day: 25 }],
  ])("%s", (input, expected) => {
    expect(parseDateCell(input, ctx)).toEqual({ ok: true, value: expected });
  });
  test("weekday alone resolves within the event window", () => {
    // Sat within Jul 24–26 2026 is Jul 25
    expect(parseDateCell("Sat", ctx)).toEqual({ ok: true, value: { year: 2026, month: 7, day: 25 } });
  });
  test("blank is ok-null (undated)", () => {
    expect(parseDateCell("", ctx)).toEqual({ ok: true, value: null });
  });
  test("gibberish fails gently", () => {
    const r = parseDateCell("banana", ctx);
    expect(r.ok).toBe(false);
  });
  test("rejects two-digit years explicitly", () => {
    expect(parseDateCell("7/25/99", ctx)).toEqual({ ok: false, error: "Use a four-digit year." });
  });
  test("rejects a date that doesn't exist (2/30)", () => {
    expect(parseDateCell("2/30", ctx)).toEqual({ ok: false, error: "That date doesn't exist." });
  });
  test("weekday with no match inside the event window fails gently", () => {
    const r = parseDateCell("Mon", ctx); // Jul 24–26 2026 has no Monday
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Mon/);
  });
});

describe("parseTimeCell", () => {
  test("blank → none", () => {
    expect(parseTimeCell("")).toEqual({ ok: true, value: { kind: "none" } });
  });
  test.each([
    ["8:00 AM - 11:00 AM", 480, 660],
    ["8-11am", 480, 660],
    ["10:30 AM- 2:00 PM", 630, 840],
    ["6:30 AM - 3:00 PM", 390, 900],
    ["1:00 PM - 3:00 PM", 780, 900],
  ])("range %s", (input, start, end) => {
    expect(parseTimeCell(input)).toEqual({ ok: true, value: { kind: "range", start, end } });
  });
  test("range infers start meridiem so start precedes end (10-1pm)", () => {
    expect(parseTimeCell("10-1pm")).toEqual({ ok: true, value: { kind: "range", start: 600, end: 780 } });
  });
  test.each([
    ["by 3:00 PM", null, 900],
    ["by 10am", null, 600],
    ["by Sat 10am", "Sat", 600],
    ["by 7/25 10:00 AM", "7/25", 600],
    ["by Sat", "Sat", null],
  ])("due-by %s", (input, dateText, time) => {
    expect(parseTimeCell(input)).toEqual({ ok: true, value: { kind: "dueBy", dateText, time } });
  });
  test("gibberish fails gently", () => {
    expect(parseTimeCell("whenever").ok).toBe(false);
  });
  test("refuses an ambiguous backwards range instead of guessing 2 AM (2-1pm)", () => {
    expect(parseTimeCell("2-1pm")).toEqual({ ok: false, error: "End time must be after start." });
  });
  test("noon range borrows correctly (12-1pm)", () => {
    expect(parseTimeCell("12-1pm")).toEqual({ ok: true, value: { kind: "range", start: 720, end: 780 } });
  });
  test.each([
    ["12pm", 720],
    ["12am", 0],
  ])("single time %s handles the 12 o'clock traps", (input, start) => {
    expect(parseTimeCell(input)).toEqual({ ok: true, value: { kind: "start", start } });
  });
});

describe("parseNeedCell", () => {
  test("blank defaults to 1", () => expect(parseNeedCell("")).toEqual({ ok: true, value: 1 }));
  test("parses integers", () => expect(parseNeedCell(" 4 ")).toEqual({ ok: true, value: 4 }));
  test("rejects zero, negatives, non-numbers", () => {
    expect(parseNeedCell("0").ok).toBe(false);
    expect(parseNeedCell("-2").ok).toBe(false);
    expect(parseNeedCell("four").ok).toBe(false);
  });
});
