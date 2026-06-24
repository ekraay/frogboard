import { describe, expect, test } from "vitest";
import { sortValue, sortRowKeys, type SortRow } from "@/lib/domain/gridSort";
import { emptyCells, type RawCells } from "@/lib/domain/gridRow";
import type { EventCtx } from "@/lib/domain/cells";

const ctx: EventCtx = {
  year: 2026,
  start: { year: 2026, month: 7, day: 24 },
  end: { year: 2026, month: 7, day: 26 },
};
function row(key: string, over: Partial<RawCells>): SortRow {
  return { key, cells: { ...emptyCells(), ...over } };
}

describe("sortValue", () => {
  test("strings are lowercased; blanks are null", () => {
    expect(sortValue({ ...emptyCells(), title: "Games" }, "title", ctx)).toBe("games");
    expect(sortValue(emptyCells(), "title", ctx)).toBeNull();
  });
  test("need is numeric; blank is null (not the default 1)", () => {
    expect(sortValue({ ...emptyCells(), need: "5" }, "need", ctx)).toBe(5);
    expect(sortValue(emptyCells(), "need", ctx)).toBeNull();
  });
  test("date parses to an ISO day; blank/garbage is null", () => {
    expect(sortValue({ ...emptyCells(), date: "Jul 25" }, "date", ctx)).toBe("2026-07-25");
    expect(sortValue({ ...emptyCells(), date: "nonsense" }, "date", ctx)).toBeNull();
  });
  test("time parses to start minutes; a frog without a clock is null", () => {
    expect(sortValue({ ...emptyCells(), time: "10:00 AM - 1:00 PM" }, "time", ctx)).toBe(600);
    expect(sortValue({ ...emptyCells(), time: "by Sat" }, "time", ctx)).toBeNull();
  });
});

describe("sortRowKeys", () => {
  test("ascending then descending by title, blanks always last", () => {
    const rows = [row("a", { title: "Setup" }), row("b", { title: "Bingo" }), row("c", {})];
    expect(sortRowKeys(rows, "title", 1, ctx)).toEqual(["b", "a", "c"]);
    expect(sortRowKeys(rows, "title", -1, ctx)).toEqual(["a", "b", "c"]);
  });
  test("numeric ordering for need, not lexical", () => {
    const rows = [row("a", { need: "10" }), row("b", { need: "2" })];
    expect(sortRowKeys(rows, "need", 1, ctx)).toEqual(["b", "a"]);
  });
  test("chronological ordering for date", () => {
    const rows = [row("a", { date: "Jul 26" }), row("b", { date: "Jul 25" })];
    expect(sortRowKeys(rows, "date", 1, ctx)).toEqual(["b", "a"]);
  });
});
