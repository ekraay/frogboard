// "Paste a list" import (AnyList-style): each non-blank line becomes one task.
// Dead simple on purpose — organizers paste their list of jobs and get rows,
// then fill in dates/times/counts in the grid (or paste those column-by-column).
// If a line has tab-separated columns (a multi-column paste), the first cell is
// the title; the rest is left for the grid.
export function linesToTaskTitles(text: string): string[] {
  return text
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((line) => (line.split("\t")[0] ?? "").trim())
    .filter((title) => title !== "");
}
