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

export const GRID_COLUMNS: { field: keyof RawCells; label: string; width: string }[] = [
  { field: "title", label: "Title", width: "w-48" },
  { field: "kind", label: "Kind", width: "w-24" },
  { field: "date", label: "Date", width: "w-28" },
  { field: "need", label: "Need", width: "w-16" },
  { field: "time", label: "Time", width: "w-40" },
  { field: "category", label: "Category", width: "w-28" },
  { field: "group", label: "Group", width: "w-28" },
  { field: "location", label: "Location", width: "w-32" },
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
    "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink outline-none transition focus:border-reed focus:ring-1 focus:ring-reed/40";
  const invalid = (field: keyof RawCells) => row.problem?.field === field;

  function onKeyDown(e: React.KeyboardEvent, field: keyof RawCells) {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      onMove(row.key, e.key === "ArrowUp" ? -1 : 1);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      onFillDown(row.key, field);
    }
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
        <td className="px-1">
          <button
            type="button"
            aria-expanded={row.expanded}
            aria-controls={row.expanded ? `row-details-${row.key}` : undefined}
            aria-label={`Details, row ${index + 1}`}
            onClick={() => onToggle(row.key)}
            className="rounded p-1 text-ink-soft transition hover:bg-lily"
          >
            {row.expanded ? "▾" : "▸"}
          </button>
        </td>
        {GRID_COLUMNS.map(({ field, label, width }) =>
          field === "kind" ? (
            <td key={field} className={width}>
              <select
                aria-label={`${label}, row ${index + 1}`}
                value={row.cells.kind}
                onChange={(e) => onCell(row.key, "kind", e.target.value)}
                onKeyDown={(e) => onKeyDown(e, field)}
                className={cellInput}
              >
                <option value="shift">Shift</option>
                <option value="frog">🐸 Frog</option>
              </select>
            </td>
          ) : (
            <td key={field} className={width}>
              <input
                aria-label={`${label}, row ${index + 1}`}
                aria-invalid={invalid(field) || undefined}
                aria-describedby={invalid(field) ? `row-problem-${row.key}` : undefined}
                value={row.cells[field]}
                onChange={(e) => onCell(row.key, field, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, field)}
                className={`${cellInput} ${invalid(field) ? "border-b-2 border-amber" : ""}`}
              />
            </td>
          ),
        )}
        <td className="px-1 text-right text-xs text-ink-soft">
          {row.signupCount > 0 && <span title="signups">👥 {row.signupCount}</span>}
        </td>
        <td className="px-1">
          <button type="button" aria-label={`Delete, row ${index + 1}`} onClick={() => onDelete(row.key)}
            className="rounded p-1 text-ink-soft transition hover:bg-lantern/15 hover:text-lantern">×</button>
        </td>
      </tr>
      {row.problem && (
        <tr><td colSpan={12} id={`row-problem-${row.key}`} className="px-10 pb-1 text-xs font-medium text-lantern">
          ⚠ {row.problem.error}
        </td></tr>
      )}
      {row.expanded && (
        <tr id={`row-details-${row.key}`}>
          <td colSpan={12} className="bg-lily/30 px-10 py-3">
            <div className="grid gap-3 md:grid-cols-3">
              {PROSE_FIELDS.map(({ field, label, placeholder }) => (
                <label key={field} className="block text-xs font-bold text-ink">
                  {label}
                  <textarea
                    rows={3}
                    placeholder={placeholder}
                    value={row.cells[field]}
                    onChange={(e) => onCell(row.key, field, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") onToggle(row.key); }}
                    className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2 text-sm font-normal text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
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
