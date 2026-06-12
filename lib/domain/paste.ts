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
