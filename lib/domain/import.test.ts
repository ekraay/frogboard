import { describe, expect, test } from "vitest";
import { detectColumns, buildImportRows, type ImportField } from "@/lib/domain/import";
import { emptyCells } from "@/lib/domain/gridRow";

describe("detectColumns", () => {
  test("a single column of names is the title", () => {
    expect(detectColumns([["Games booth"], ["Bingo"]]).fields).toEqual(["title"]);
  });

  test("sniffs the Ginza shape: date, task, time, count", () => {
    const grid = [
      ["Tuesday, July 21", "Layout tables", "6:00 PM - 10:00 PM", "15"],
      ["Wednesday, July 22", "Bingo", "6:00 PM - 10:00 PM", "5"],
    ];
    const r = detectColumns(grid);
    expect(r.headerRow).toBe(false);
    expect(r.fields).toEqual(["date", "title", "time", "need"]);
  });

  test("drops a header row and lets content override a wrong header name", () => {
    // header calls column 2 "Date", but it's actually times → trust the content
    const grid = [["Task", "Date"], ["Setup", "9-11am"], ["Grill", "2-4pm"]];
    const r = detectColumns(grid);
    expect(r.headerRow).toBe(true);
    expect(r.fields).toEqual(["title", "time"]);
  });

  test("falls back to the first column as the title when nothing looks like text", () => {
    // a lone column of times: still produces tasks (each line is an item)
    expect(detectColumns([["10am"], ["11am"]]).fields).toEqual(["title"]);
  });
});

describe("buildImportRows", () => {
  test("pulls name, time, and count from a multi-column block", () => {
    const grid = [
      ["Tuesday, July 21", "Layout tables", "6:00 PM - 10:00 PM", "15"],
      ["Wednesday, July 22", "Bingo", "6:00 PM - 10:00 PM", "5"],
    ];
    const fields: ImportField[] = ["date", "title", "time", "need"];
    const rows = buildImportRows(grid, fields, false, emptyCells);
    expect(rows.map((c) => ({ title: c.title, time: c.time, need: c.need }))).toEqual([
      { title: "Layout tables", time: "6:00 PM - 10:00 PM", need: "15" },
      { title: "Bingo", time: "6:00 PM - 10:00 PM", need: "5" },
    ]);
  });

  test("skips title-less rows (section/date headers, blanks) and carries dates forward", () => {
    const grid = [
      ["Saturday, July 25", "", "", ""],     // date-header → no title → skipped
      ["", "Setup", "", ""],
      ["", "", "", ""],                      // blank → skipped
      ["Sunday, July 26", "Cleanup", "", ""],
    ];
    const fields: ImportField[] = ["date", "title", "time", "need"];
    const rows = buildImportRows(grid, fields, false, emptyCells);
    expect(rows.map((c) => c.title)).toEqual(["Setup", "Cleanup"]);
    expect(rows.map((c) => c.date)).toEqual(["Saturday, July 25", "Sunday, July 26"]);
  });

  test("each line of a single-column paste becomes a title", () => {
    const rows = buildImportRows([["Games booth"], [""], ["Bingo"]], ["title"], false, emptyCells);
    expect(rows.map((c) => c.title)).toEqual(["Games booth", "Bingo"]);
  });
});
