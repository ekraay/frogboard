import { describe, expect, test } from "vitest";
import { formatTime, formatWhen } from "@/lib/domain/time";
import type { BoardTask } from "@/lib/domain/types";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null,
    requestedGroup: null, neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
    startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, position: 0, status: "todo", waiting: false,
    signups: [], ...overrides,
  };
}

describe("formatTime (America/Los_Angeles)", () => {
  test("17:00 UTC renders as 10:00 AM PDT", () => {
    expect(formatTime(new Date("2026-07-25T17:00:00Z"))).toBe("10:00 AM");
  });
  test("20:00 UTC renders as 1:00 PM PDT", () => {
    expect(formatTime(new Date("2026-07-25T20:00:00Z"))).toBe("1:00 PM");
  });
  test("18:00 UTC in winter renders as 10:00 AM PST (DST handled)", () => {
    // Same wall-clock 10:00 AM as summer's 17:00Z, but a different UTC offset —
    // proves the formatter follows DST rather than a fixed offset.
    expect(formatTime(new Date("2026-01-15T18:00:00Z"))).toBe("10:00 AM");
  });
});

describe("formatWhen", () => {
  test("shift with start and end", () => {
    expect(
      formatWhen(task({
        startAt: new Date("2026-07-25T17:00:00Z"),
        endAt: new Date("2026-07-25T20:00:00Z"),
      })),
    ).toBe("10:00 AM–1:00 PM");
  });
  test("shift with a date but no times is all day", () => {
    expect(formatWhen(task({ startAt: null, endAt: null }))).toBe("All day");
  });
  test("frog with a deadline", () => {
    expect(
      formatWhen(task({ kind: "errand", date: null, dueBy: new Date("2026-07-25T17:00:00Z") })),
    ).toBe("By Jul 25");
  });
  test("frog with no deadline is anytime", () => {
    expect(
      formatWhen(task({ kind: "errand", date: null, dueBy: null })),
    ).toBe("Anytime");
  });
  test("a frog shows its deadline, or 'Anytime' when it has none", () => {
    expect(
      formatWhen(task({ kind: "errand", date: null, dueBy: new Date("2026-07-25T12:00:00Z") })),
    ).toMatch(/^By /);
    expect(
      formatWhen(task({ kind: "errand", date: null, dueBy: null })),
    ).toBe("Anytime");
  });
});
