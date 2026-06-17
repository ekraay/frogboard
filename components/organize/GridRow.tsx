"use client";

import type { RawCells } from "@/lib/domain/gridRow";

export interface RowState {
  key: string;
  taskId: string | null;
  cells: RawCells;
  signupCount: number;
  state: "saved" | "dirty" | "saving" | "invalid" | "error";
  problem: { field: keyof RawCells; error: string } | null;
  expanded: boolean;
}

// Ghost text in every cell guides manual entry (and signals "type here") —
// the single biggest help for spreadsheet folks filling a blank grid.
export const GRID_COLUMNS: { field: keyof RawCells; label: string; width: string; placeholder?: string }[] = [
  { field: "title", label: "Title", width: "w-48", placeholder: "e.g. Games booth" },
  { field: "kind", label: "Kind", width: "w-24" },
  { field: "date", label: "Date", width: "w-28", placeholder: "Jul 25" },
  { field: "need", label: "Need", width: "w-16", placeholder: "#" },
  { field: "time", label: "Time", width: "w-44", placeholder: "10am–1pm · or “by Sat 9am”" },
  { field: "category", label: "Category", width: "w-32", placeholder: "Food, Games, Setup…" },
  { field: "group", label: "Group", width: "w-28", placeholder: "Scouts, YAO…" },
  { field: "location", label: "Location", width: "w-32", placeholder: "Inside Gym…" },
];

const PROSE_FIELDS: { field: keyof RawCells; label: string; placeholder: string }[] = [
  { field: "description", label: "Description", placeholder: "What is this about? Why is it important?" },
  { field: "definitionOfDone", label: "Definition of done", placeholder: "What does done look like?" },
  { field: "pointOfContact", label: "Point of contact", placeholder: "Who can help?" },
];

export function GridRow({
  row, index, onCell, onToggle, onDelete, onMove, onBlurRow, onFillDown,
}: {
  row: RowState;
  index: number;
  onCell: (key: string, field: keyof RawCells, value: string) => void;
  onToggle: (key: string) => void;
  onDelete: (key: string) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onBlurRow: (key: string) => void;
  onFillDown: (key: string, field: keyof RawCells) => void;
}) {
  const cellInput =
    "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-ink-soft focus:border-reed focus:ring-1 focus:ring-reed/40";
  const invalid = (field: keyof RawCells) => row.problem?.field === field;
  const hasDetails = !!(
    row.cells.description.trim() ||
    row.cells.definitionOfDone.trim() ||
    row.cells.pointOfContact.trim()
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      onMove(row.key, e.key === "ArrowUp" ? -1 : 1);
    }
    // Fill-down is the ⤓ handle now — no Ctrl/Cmd+D (it clashes with the
    // browser's bookmark shortcut).
  }

  return (
    <>
      <tr
        className={row.state === "invalid" || row.state === "error" ? "bg-amber/10" : undefined}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) onBlurRow(row.key);
        }}
      >
        <td className="whitespace-nowrap px-1 text-center align-middle">
          <button type="button" aria-label={`Move up, row ${index + 1}`}
            onClick={() => onMove(row.key, -1)}
            className="rounded p-0.5 text-ink-soft transition hover:bg-lily">↑</button>
          <button type="button" aria-label={`Move down, row ${index + 1}`}
            onClick={() => onMove(row.key, 1)}
            className="rounded p-0.5 text-ink-soft transition hover:bg-lily">↓</button>
        </td>
        <td className="px-1 align-middle">
          {/* A labeled, stateful affordance — empty invites ("＋"), filled shows a
              lantern dot, open shows a chevron. Self-explanatory, never a mystery. */}
          <button
            type="button"
            aria-expanded={row.expanded}
            aria-controls={row.expanded ? `row-details-${row.key}` : undefined}
            aria-label={`Details, row ${index + 1}`}
            onClick={() => onToggle(row.key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              row.expanded
                ? "border-reed/40 bg-reed/10 text-reed-deep"
                : hasDetails
                  ? "border-lily-line bg-lily text-ink hover:border-reed/50"
                  : "border-dashed border-lily-line text-ink-soft hover:border-reed hover:text-reed-deep"
            }`}
          >
            {row.expanded ? (
              <span aria-hidden className="text-[0.65rem] leading-none">▾</span>
            ) : hasDetails ? (
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-lantern" />
            ) : (
              <span aria-hidden className="text-[0.8rem] leading-none">＋</span>
            )}
            Details
          </button>
        </td>
        {GRID_COLUMNS.map(({ field, label, width, placeholder }) =>
          field === "kind" ? (
            <td key={field} className={width}>
              <select
                data-rowkey={row.key}
                data-field={field}
                aria-label={`${label}, row ${index + 1}`}
                value={row.cells.kind}
                onChange={(e) => onCell(row.key, "kind", e.target.value)}
                onKeyDown={onKeyDown}
                className={cellInput}
              >
                <option value="shift">Shift</option>
                <option value="frog">🐸 Frog</option>
              </select>
            </td>
          ) : (
            <td key={field} className={width}>
              <div className="group relative">
                <input
                  data-rowkey={row.key}
                  data-field={field}
                  aria-label={`${label}, row ${index + 1}`}
                  aria-invalid={invalid(field) || undefined}
                  aria-describedby={invalid(field) ? `row-problem-${row.key}` : undefined}
                  placeholder={placeholder}
                  value={row.cells[field]}
                  onChange={(e) => onCell(row.key, field, e.target.value)}
                  onKeyDown={onKeyDown}
                  className={`${cellInput} pr-5 ${invalid(field) ? "border-b-2 border-amber" : ""}`}
                />
                {/* Spreadsheet fill-down: copy this value into every row below.
                    Revealed on hover/focus; Ctrl/Cmd+D does the same from the keyboard. */}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Fill ${label} down to the rows below, row ${index + 1}`}
                  title={`Fill ${label} down`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onFillDown(row.key, field)}
                  className="absolute right-0.5 top-1/2 hidden -translate-y-1/2 rounded px-1 text-xs leading-none text-ink-soft transition hover:text-reed-deep group-hover:block group-focus-within:block"
                >⤓</button>
              </div>
            </td>
          ),
        )}
        <td className="px-1 text-right text-xs text-ink-soft">
          {row.signupCount > 0 && <span title="signups">👥 {row.signupCount}</span>}
        </td>
        <td className="px-1">
          <button type="button" aria-label={`Delete, row ${index + 1}`} onClick={() => onDelete(row.key)}
            className="rounded p-1 text-ink-soft transition hover:bg-lantern/15 hover:text-lantern-deep">×</button>
        </td>
      </tr>
      {row.problem && (
        <tr><td colSpan={12} id={`row-problem-${row.key}`} className="px-10 pb-1 text-xs font-medium text-lantern-deep">
          ⚠ {row.problem.error}
        </td></tr>
      )}
      {row.expanded && (
        <tr id={`row-details-${row.key}`}>
          <td colSpan={12} className="border-l-[3px] border-reed/40 bg-lily/40 px-6 py-4">
            <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-ink-soft">
              More about this task <span className="font-medium normal-case tracking-normal text-ink-soft">— all optional</span>
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {PROSE_FIELDS.map(({ field, label, placeholder }) => (
                <label key={field} className="block text-xs font-bold text-ink">
                  {label}
                  <textarea
                    rows={3}
                    placeholder={placeholder}
                    value={row.cells[field]}
                    onChange={(e) => onCell(row.key, field, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") onToggle(row.key); }}
                    className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2 text-sm font-normal text-ink outline-none transition placeholder:text-ink-soft focus:border-reed focus:ring-2 focus:ring-reed/30"
                  />
                </label>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
