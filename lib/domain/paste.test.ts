import { describe, expect, test } from "vitest";
import { parseTsv, carryForwardColumn } from "@/lib/domain/paste";

describe("parseTsv", () => {
  test("splits rows and cells, dropping a trailing newline", () => {
    expect(parseTsv("a\tb\nc\td\n")).toEqual([["a", "b"], ["c", "d"]]);
  });
  test("handles CRLF", () => {
    expect(parseTsv("a\tb\r\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("carryForwardColumn", () => {
  test("fills blank cells from the row above (the sheets' date convention)", () => {
    const rows = [["Sat Jul 25", "Games"], ["", "Bingo"], ["", "Food"], ["Sun Jul 26", "Rice"]];
    expect(carryForwardColumn(rows, 0)).toEqual([
      ["Sat Jul 25", "Games"], ["Sat Jul 25", "Bingo"], ["Sat Jul 25", "Food"], ["Sun Jul 26", "Rice"],
    ]);
  });
  test("leading blanks stay blank", () => {
    expect(carryForwardColumn([["", "a"], ["7/25", "b"]], 0)).toEqual([["", "a"], ["7/25", "b"]]);
  });
});
