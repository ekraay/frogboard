import { describe, expect, test } from "vitest";
import { linesToTaskTitles } from "@/lib/domain/import";

describe("linesToTaskTitles", () => {
  test("each non-blank line becomes a task title", () => {
    expect(linesToTaskTitles("Games booth\nBingo\nFood service")).toEqual([
      "Games booth", "Bingo", "Food service",
    ]);
  });

  test("trims whitespace, drops blank lines, handles CRLF", () => {
    expect(linesToTaskTitles("  Setup  \r\n\r\n Cleanup \n")).toEqual(["Setup", "Cleanup"]);
  });

  test("takes the first column when lines carry tabs (multi-column paste)", () => {
    expect(linesToTaskTitles("Takuan making\t1:00 PM - 3:00 PM\t4\nCurry prep\t6:00 PM")).toEqual([
      "Takuan making", "Curry prep",
    ]);
  });

  test("empty input yields no tasks", () => {
    expect(linesToTaskTitles("   \n\n")).toEqual([]);
  });
});
