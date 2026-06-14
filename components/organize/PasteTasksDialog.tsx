"use client";

import { useEffect, useRef, useState } from "react";
import { linesToTaskTitles } from "@/lib/domain/import";

/**
 * A distinct "paste a list" modal (AnyList-style) — a clear copy/paste
 * affordance, separate from row-by-row entry. Each line becomes one task.
 */
export function PasteTasksDialog({
  onAdd,
  onClose,
}: {
  onAdd: (titles: string[]) => void;
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

  const titles = linesToTaskTitles(text);

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
          Each line becomes a task. Add the dates, times, and counts afterward in the grid.
        </p>
        <label htmlFor="paste-tasks-text" className="sr-only">Tasks, one per line</label>
        <textarea
          id="paste-tasks-text"
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={"Games booth\nBingo\nFood service\nBring 50 paper cups"}
          className="mt-3 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
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
            disabled={titles.length === 0}
            onClick={() => onAdd(titles)}
            className="rounded-xl bg-reed px-4 py-2 text-sm font-bold text-white transition hover:bg-reed-deep disabled:opacity-60"
          >
            {titles.length > 0 ? `Add ${titles.length} task${titles.length > 1 ? "s" : ""}` : "Add tasks"}
          </button>
        </div>
      </div>
    </div>
  );
}
