/** Clipboard TSV → rows of cells. The whole "import" is these two functions. */
export function parseTsv(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((l) => l.split("\t"));
}

/** Sheets convention: a date typed once governs the blank rows beneath it. */
export function carryForwardColumn(rows: string[][], col: number): string[][] {
  let last = "";
  return rows.map((row) => {
    const copy = [...row];
    if ((copy[col] ?? "").trim() === "") {
      if (last !== "") copy[col] = last;
    } else {
      last = copy[col];
    }
    return copy;
  });
}
