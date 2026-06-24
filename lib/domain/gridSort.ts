import type { RawCells } from "@/lib/domain/gridRow";
import type { EventCtx } from "@/lib/domain/cells";
import { parseDateCell, parseTimeCell, parseNeedCell } from "@/lib/domain/cells";

export type SortColumn =
  | "title" | "kind" | "date" | "need" | "time" | "category" | "group" | "location";

export interface SortRow { key: string; cells: RawCells }

/** Comparable value for one row + column. Blank/unparseable -> null (sorts last). */
export function sortValue(cells: RawCells, column: SortColumn, ctx: EventCtx): string | number | null {
  switch (column) {
    case "title": case "kind": case "category": case "group": case "location": {
      const s = cells[column].trim().toLowerCase();
      return s === "" ? null : s;
    }
    case "need": {
      if (cells.need.trim() === "") return null;
      const r = parseNeedCell(cells.need);
      return r.ok ? r.value : null;
    }
    case "date": {
      const r = parseDateCell(cells.date, ctx);
      if (!r.ok || r.value === null) return null;
      const { year, month, day } = r.value;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    case "time": {
      const r = parseTimeCell(cells.time);
      if (!r.ok) return null;
      const v = r.value;
      if (v.kind === "none") return null;
      if (v.kind === "range" || v.kind === "start") return v.start;
      return v.time; // dueBy; may be null (a frog with no clock)
    }
  }
}

// Each SortColumn yields one type for all its non-null values (numbers for
// "need"/"time", strings elsewhere), so a and b always share a type here.
function compare(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Ordered row keys for a column + direction (1 asc, -1 desc). Nulls always last. */
export function sortRowKeys(rows: SortRow[], column: SortColumn, dir: 1 | -1, ctx: EventCtx): string[] {
  const tagged = rows.map((r, i) => ({ key: r.key, i, v: sortValue(r.cells, column, ctx) }));
  const valued = tagged.filter((x) => x.v !== null);
  const nulls = tagged.filter((x) => x.v === null);
  valued.sort((a, b) => {
    const c = compare(a.v as string | number, b.v as string | number);
    return c !== 0 ? c * dir : a.i - b.i; // stable on ties
  });
  return [...valued, ...nulls].map((x) => x.key);
}
