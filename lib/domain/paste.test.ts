import { describe, expect, test } from "vitest";
import { parseTsv, carryForwardColumn, applyPaste } from "@/lib/domain/paste";
import { emptyCells, type RawCells } from "@/lib/domain/gridRow";

const ORDER: (keyof RawCells)[] = [
  "title", "kind", "date", "need", "time", "category", "group", "location",
];
const titles = (cs: RawCells[]) => cs.map((c) => c.title);

describe("parseTsv", () => {
  test("splits rows and cells, dropping a trailing newline", () => {
    expect(parseTsv("a\tb\nc\td\n")).toEqual([["a", "b"], ["c", "d"]]);
  });
  test("handles CRLF", () => {
    expect(parseTsv("a\tb\r\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
  });
  test("keeps a quoted multiline cell as ONE cell (Sheets RFC 4180 clipboard)", () => {
    expect(parseTsv('Tare making\t"mixing and heating-\nstore in pot in ref."\t2\n')).toEqual([
      ["Tare making", "mixing and heating-\nstore in pot in ref.", "2"],
    ]);
  });
  test("unescapes doubled quotes inside a quoted cell", () => {
    expect(parseTsv('a\t"say ""hi"" twice"\n')).toEqual([["a", 'say "hi" twice']]);
  });
  test("handles bare CR line endings", () => {
    expect(parseTsv("a\tb\rc\td")).toEqual([["a", "b"], ["c", "d"]]);
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
  test("does not extend rows shorter than the carry column", () => {
    expect(carryForwardColumn([["x", "7/25"], ["short"], ["y", ""]], 1)).toEqual([
      ["x", "7/25"], ["short"], ["y", "7/25"],
    ]);
  });
});

describe("applyPaste (column-aware: lands at the focused cell)", () => {
  test("a single column fills the anchored column down, growing the grid", () => {
    const r = applyPaste([emptyCells()], [["Games"], ["Bingo"], ["Food"]], { row: 0, col: 0 }, ORDER, emptyCells);
    expect(titles(r.cells)).toEqual(["Games", "Bingo", "Food"]);
    expect(r.affected).toEqual([0, 1, 2]);
  });

  test("pasting into the Time column fills Time, leaving titles untouched", () => {
    const start = [
      { ...emptyCells(), title: "Games" },
      { ...emptyCells(), title: "Bingo" },
    ];
    const r = applyPaste(start, [["10am-1pm"], ["1-4pm"]], { row: 0, col: ORDER.indexOf("time") }, ORDER, emptyCells);
    expect(titles(r.cells)).toEqual(["Games", "Bingo"]);
    expect(r.cells.map((c) => c.time)).toEqual(["10am-1pm", "1-4pm"]);
  });

  test("anchoring at a later row overwrites from there, not the top", () => {
    const start = [
      { ...emptyCells(), title: "keep" },
      { ...emptyCells(), title: "old" },
    ];
    const r = applyPaste(start, [["new"]], { row: 1, col: 0 }, ORDER, emptyCells);
    expect(titles(r.cells)).toEqual(["keep", "new"]);
    expect(r.affected).toEqual([1]);
  });

  test("a multi-column block maps left-to-right from the anchor column", () => {
    // authored in our order: title, kind, date, need
    const r = applyPaste([emptyCells()], [["Games", "shift", "Jul 25", "5"]], { row: 0, col: 0 }, ORDER, emptyCells);
    expect(r.cells[0]).toMatchObject({ title: "Games", kind: "shift", date: "Jul 25", need: "5" });
  });

  test("cells past the last column are dropped (no overflow)", () => {
    const r = applyPaste([emptyCells()], [["A", "B", "C"]], { row: 0, col: ORDER.indexOf("location") }, ORDER, emptyCells);
    expect(r.cells[0].location).toBe("A"); // B and C have nowhere to go
  });

  test("a sparse date column carries forward when it lands on Date", () => {
    const r = applyPaste(
      [emptyCells(), emptyCells(), emptyCells()],
      [["Sat Jul 25"], [""], ["Sun Jul 26"]],
      { row: 0, col: ORDER.indexOf("date") },
      ORDER, emptyCells,
    );
    expect(r.cells.map((c) => c.date)).toEqual(["Sat Jul 25", "Sat Jul 25", "Sun Jul 26"]);
  });

  test("a pasted Kind value normalizes to shift/errand", () => {
    const r = applyPaste([emptyCells()], [["errand"]], { row: 0, col: ORDER.indexOf("kind") }, ORDER, emptyCells);
    expect(r.cells[0].kind).toBe("errand");
    const s = applyPaste([emptyCells()], [["whatever"]], { row: 0, col: ORDER.indexOf("kind") }, ORDER, emptyCells);
    expect(s.cells[0].kind).toBe("shift");
  });

  test("legacy frog value normalizes to errand", () => {
    const r = applyPaste([emptyCells()], [["frog"]], { row: 0, col: ORDER.indexOf("kind") }, ORDER, emptyCells);
    expect(r.cells[0].kind).toBe("errand");
  });
});
