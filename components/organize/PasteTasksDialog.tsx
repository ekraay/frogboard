"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseTsv } from "@/lib/domain/paste";
import { detectColumns, buildImportRows } from "@/lib/domain/import";
import { emptyCells, type RawCells } from "@/lib/domain/gridRow";

/**
 * A distinct "paste a list" modal (AnyList-style) — a clear copy/paste
 * affordance, separate from row-by-row entry. Each line becomes a task. When
 * lines carry columns (a copy from a sheet), we detect the name/time/count and
 * preview them, so the organizer sees exactly what will be created.
 */
export function PasteTasksDialog({
  onAdd,
  onClose,
}: {
  onAdd: (rows: RawCells[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tasks = useMemo(() => {
    if (text.trim() === "") return [];
    const grid = parseTsv(text);
    const { headerRow, fields } = detectColumns(grid);
    return buildImportRows(grid, fields, headerRow, emptyCells);
  }, [text]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]">
      {/* backdrop is a real button so clicking outside closes (keyboard-safe) */}
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-tasks-title"
        className="relative w-full max-w-lg rounded-3xl border border-lily-line bg-white p-6 shadow-2xl"
      >
        <h2 id="paste-tasks-title" className="font-display text-xl font-bold text-ink">Paste a list of tasks</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Each line becomes a task. Paste whole rows from your sheet — we’ll pull out the name, time, and count.
        </p>
        <label htmlFor="paste-tasks-text" className="sr-only">Tasks, one per line</label>
        <textarea
          id="paste-tasks-text"
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"Games booth\nBingo\nFood service\nBring 50 paper cups"}
          className="mt-3 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-reed focus:ring-2 focus:ring-reed/30"
        />

        {tasks.length > 0 && (
          <div className="mt-3 rounded-xl border border-lily-line bg-lily/40 p-3">
            <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-soft">
              Preview — {tasks.length} task{tasks.length > 1 ? "s" : ""} will be added
            </p>
            <ul aria-label="Preview of tasks to add" className="mt-1.5 max-h-44 space-y-1 overflow-auto text-sm text-ink">
              {tasks.map((t, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span aria-hidden className="shrink-0 text-reed">🐸</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                  {t.time && <span className="shrink-0 text-xs text-ink-soft">{t.time}</span>}
                  {t.need && (
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink-soft">
                      {t.need}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-lily-line px-4 py-2 text-sm font-medium text-ink-soft transition hover:bg-lily"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={tasks.length === 0}
            onClick={() => onAdd(tasks)}
            className="rounded-xl bg-reed px-4 py-2 text-sm font-bold text-white transition hover:bg-reed-deep disabled:opacity-60"
          >
            {tasks.length > 0 ? `Add ${tasks.length} task${tasks.length > 1 ? "s" : ""}` : "Add tasks"}
          </button>
        </div>
      </div>
    </div>
  );
}
