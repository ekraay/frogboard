import type { RawCells } from "@/lib/domain/gridRow";

/**
 * Clipboard TSV → rows of cells. Sheets wraps cells containing newlines, tabs
 * or quotes in double quotes (RFC 4180 style, inner quotes doubled) — handle
 * that so a multiline description can't silently column-shift the rows below.
 */
export function parseTsv(text: string): string[][] {
  const src = text.replace(/\r\n|\r/g, "\n");
  const rows: string[][] = [[]];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === "\t") {
      rows[rows.length - 1].push(cell);
      cell = "";
    } else if (ch === "\n") {
      rows[rows.length - 1].push(cell);
      cell = "";
      rows.push([]);
    } else {
      cell += ch;
    }
  }
  rows[rows.length - 1].push(cell);
  const last = rows[rows.length - 1];
  if (rows.length > 1 && last.length === 1 && last[0] === "") rows.pop();
  return rows;
}

/** Sheets convention: a date typed once governs the blank rows beneath it. */
export function carryForwardColumn(rows: string[][], col: number): string[][] {
  let last = "";
  return rows.map((row) => {
    const copy = [...row];
    if (col >= copy.length) {
      // row doesn't reach the column — pass through untouched, don't reset carry
      return copy;
    }
    if ((copy[col] ?? "").trim() === "") {
      if (last !== "") copy[col] = last;
    } else {
      last = copy[col];
    }
    return copy;
  });
}

/**
 * Column-aware paste: lands the clipboard grid at the focused cell (anchor
 * row + column), filling right and down — overwriting existing rows and adding
 * new ones, exactly like pasting in a spreadsheet. This lets organizers place
 * each column where it belongs ("copy the times column → click Time → paste")
 * instead of relying on their sheet's column order matching ours.
 *
 * `fieldOrder` is the grid's left-to-right column fields. Cells whose target
 * column would fall past the last one are dropped. A pasted column that lands
 * on the Date field carries blanks forward (the sheets' sparse-date convention).
 */
export function applyPaste(
  current: RawCells[],
  grid: string[][],
  anchor: { row: number; col: number },
  fieldOrder: (keyof RawCells)[],
  blank: () => RawCells,
): { cells: RawCells[]; affected: number[] } {
  const row = Math.max(0, Math.min(anchor.row, current.length));
  const col = Math.max(0, anchor.col);

  // Carry forward the pasted column (if any) that maps onto the Date field.
  const dateCol = fieldOrder.indexOf("date") - col;
  const g = dateCol >= 0 ? carryForwardColumn(grid, dateCol) : grid;

  const cells = current.map((c) => ({ ...c }));
  const affected = new Set<number>();

  g.forEach((pastedRow, r) => {
    const target = row + r;
    while (cells.length <= target) cells.push(blank());
    pastedRow.forEach((value, c) => {
      const field = fieldOrder[col + c];
      if (!field) return; // nowhere to put it — past the last column
      cells[target][field] =
        field === "kind" ? (/frog|mission/i.test(value) ? "mission" : "shift") : value.trim();
    });
    affected.add(target);
  });

  return { cells, affected: [...affected] };
}
