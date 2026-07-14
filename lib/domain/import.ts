// "Paste a list" import. Each line becomes a task. When the pasted lines carry
// columns (a multi-column copy from a sheet), we detect which column is the
// task name, the time, the count, the date — by content — so the preview and
// the created tasks capture all of it, regardless of the sheet's column order.
// Best-effort; the organizer sees the result in the preview before adding.
import type { RawCells } from "@/lib/domain/gridRow";
import { carryForwardColumn } from "@/lib/domain/paste";

export type ImportField =
  | "title" | "kind" | "date" | "need" | "time"
  | "category" | "group" | "location" | "description" | "skip";

// Header-name synonyms, only for the *text* fields (objective columns —
// date/time/need — are decided by content, which is more reliable).
const TEXT_HEADERS: [Exclude<ImportField, "skip" | "date" | "time" | "need" | "kind">, string[]][] = [
  ["title", ["title", "task", "job", "duty", "activity", "role", "name of task"]],
  ["category", ["category", "area", "section"]],
  ["group", ["group", "requested", "affiliate", "team"]],
  ["location", ["location", "place", "where", "station", "room"]],
  ["description", ["description", "notes", "details", "about", "instructions"]],
];

function matchTextHeader(name: string): ImportField | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  for (const [field, syns] of TEXT_HEADERS) {
    if (syns.some((s) => n === s || n.includes(s))) return field;
  }
  return null;
}

const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/;

function looksTime(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (t === "") return false;
  if (/^by\s+/.test(t)) return true;
  return /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(t);
}
function looksDate(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (t === "") return false;
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(t)) return true;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) return true;
  return MONTHS.test(t) && /\d/.test(t);
}
function looksInt(s: string): boolean {
  return /^\d{1,3}$/.test(s.trim());
}

type Coarse = "time" | "date" | "need" | "text";

function sniffColumn(cells: string[]): Coarse {
  const vals = cells.filter((c) => c.trim() !== "");
  if (vals.length === 0) return "text";
  let time = 0, date = 0, need = 0;
  for (const v of vals) {
    if (looksTime(v)) time++;
    else if (looksDate(v)) date++;
    else if (looksInt(v)) need++;
  }
  const text = vals.length - time - date - need;
  const max = Math.max(time, date, need, text);
  if (max === text) return "text";
  if (max === time) return "time";
  if (max === date) return "date";
  return "need";
}

// Objective-field header words — exact match only, so a task title that merely
// contains "count" isn't mistaken for a header.
const OBJECTIVE_HEADER_WORDS = [
  "date", "day", "time", "when", "hours", "need", "needed",
  "count", "number", "#", "qty", "slots", "kind",
];
function isHeaderCell(s: string): boolean {
  const n = s.trim().toLowerCase();
  if (!n) return false;
  return matchTextHeader(n) !== null || OBJECTIVE_HEADER_WORDS.includes(n);
}

function isHeaderRow(row: string[]): boolean {
  const nonEmpty = row.filter((c) => c.trim() !== "");
  if (nonEmpty.length === 0) return false;
  const named = nonEmpty.filter(isHeaderCell).length;
  return named >= Math.ceil(nonEmpty.length / 2);
}

export function detectColumns(grid: string[][]): { headerRow: boolean; fields: ImportField[] } {
  const width = grid.reduce((w, r) => Math.max(w, r.length), 0);
  if (width === 0) return { headerRow: false, fields: [] };

  const headerRow = grid.length > 0 && isHeaderRow(grid[0]);
  const header = headerRow ? grid[0] : [];
  const data = headerRow ? grid.slice(1) : grid;

  const used = new Set<ImportField>();
  const fields: ImportField[] = [];
  for (let c = 0; c < width; c++) {
    const coarse = sniffColumn(data.map((r) => r[c] ?? ""));
    let f: ImportField;
    if (coarse === "time" || coarse === "date" || coarse === "need") {
      f = coarse; // objective content wins
    } else {
      f = (headerRow ? matchTextHeader(header[c] ?? "") : null) ?? "title";
    }
    if (f !== "skip" && used.has(f)) f = "skip"; // no field twice — first wins
    if (f !== "skip") used.add(f);
    fields.push(f);
  }

  // Always have somewhere for the name to go: if nothing looked like a title,
  // treat the first column as the title (AnyList "each line is an item").
  if (!fields.includes("title")) fields[0] = "title";

  return { headerRow, fields };
}

export function buildImportRows(
  grid: string[][],
  fields: ImportField[],
  headerRow: boolean,
  blank: () => RawCells,
): RawCells[] {
  const data = headerRow ? grid.slice(1) : grid;
  const dateCol = fields.indexOf("date");
  const rows = dateCol >= 0 ? carryForwardColumn(data, dateCol) : data;

  const out: RawCells[] = [];
  for (const r of rows) {
    const cells = blank();
    fields.forEach((f, c) => {
      if (f === "skip") return;
      const v = (r[c] ?? "").trim();
      if (v === "") return;
      cells[f] = f === "kind" ? (/frog|task|errand/i.test(v) ? "errand" : "shift") : v;
    });
    if (cells.title.trim() === "") continue; // not a task — skip headers/blanks
    out.push(cells);
  }
  return out;
}
