import { describe, expect, test } from "vitest";
import { parseEventDates } from "@/lib/domain/eventDates";

const iso = (d: Date) => d.toISOString();

describe("parseEventDates", () => {
  test("accepts ISO yyyy-mm-dd (what the old date picker produced)", () => {
    const r = parseEventDates("2027-02-01", "2027-02-01", 2026);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(iso(r.startDate)).toBe("2027-02-01T00:00:00.000Z");
    expect(iso(r.endDate)).toBe("2027-02-01T00:00:00.000Z");
  });

  test("accepts US slashes with a four-digit year", () => {
    const r = parseEventDates("09/25/2026", "09/27/2026", 2020);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(iso(r.startDate)).toBe("2026-09-25T00:00:00.000Z");
    expect(iso(r.endDate)).toBe("2026-09-27T00:00:00.000Z");
  });

  test("a year-less start falls back to the reference year", () => {
    const r = parseEventDates("9/25", "9/27", 2026);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(iso(r.startDate)).toBe("2026-09-25T00:00:00.000Z");
    expect(iso(r.endDate)).toBe("2026-09-27T00:00:00.000Z");
  });

  test("a year-less end inherits the start's typed year", () => {
    const r = parseEventDates("9/25/2026", "9/27", 2020);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(iso(r.endDate)).toBe("2026-09-27T00:00:00.000Z");
  });

  test("accepts month names, with or without a year", () => {
    const r = parseEventDates("Sep 25 2026", "September 27, 2026", 2020);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(iso(r.startDate)).toBe("2026-09-25T00:00:00.000Z");
    expect(iso(r.endDate)).toBe("2026-09-27T00:00:00.000Z");
  });

  test("rejects a two-digit year (ambiguous)", () => {
    const r = parseEventDates("9/25/26", "9/27/26", 2026);
    expect(r).toEqual({ ok: false, field: "startDate", error: "Use a four-digit year, like 2026." });
  });

  test("rejects an impossible date", () => {
    const r = parseEventDates("2/30/2026", "3/1/2026", 2026);
    expect(r).toEqual({ ok: false, field: "startDate", error: "That date doesn't exist." });
  });

  test("rejects a blank start with its field tagged", () => {
    const r = parseEventDates("", "9/27/2026", 2026);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe("startDate");
  });

  test("rejects gibberish with a helpful message", () => {
    const r = parseEventDates("banana", "9/27/2026", 2026);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe("startDate");
    expect(r.error).toMatch(/9\/25\/2026|Sep 25/);
  });

  test("rejects an end before the start", () => {
    const r = parseEventDates("9/27/2026", "9/25/2026", 2026);
    expect(r).toEqual({ ok: false, field: "endDate", error: "The last day can't be before the first." });
  });

  test("allows a single-day event (end == start)", () => {
    const r = parseEventDates("9/25/2026", "9/25/2026", 2026);
    expect(r.ok).toBe(true);
  });
});
