import { describe, expect, test } from "vitest";
import { effectiveStatus, eventStatus, type RsvpRecord } from "@/lib/domain/rsvp";

const D1 = new Date("2026-07-25T00:00:00Z");

describe("effectiveStatus", () => {
  test("blank when no records", () => {
    expect(effectiveStatus([], null)).toBe("blank");
  });
  test("uses the whole-event (null) answer", () => {
    expect(effectiveStatus([{ day: null, status: "yes" }], null)).toBe("yes");
  });
  test("a day-specific answer overrides the whole-event one", () => {
    const recs: RsvpRecord[] = [{ day: null, status: "yes" }, { day: D1, status: "no" }];
    expect(effectiveStatus(recs, D1)).toBe("no");
    expect(effectiveStatus(recs, null)).toBe("yes");
  });
});

describe("eventStatus", () => {
  test("yes beats maybe beats no beats blank", () => {
    expect(eventStatus([])).toBe("blank");
    expect(eventStatus([{ day: null, status: "no" }])).toBe("no");
    expect(eventStatus([{ day: D1, status: "no" }, { day: null, status: "maybe" }])).toBe("maybe");
    expect(eventStatus([{ day: D1, status: "yes" }, { day: null, status: "no" }])).toBe("yes");
  });
});
