"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveTask, deleteTask, reorderTasks, setEventStatusAction } from "@/app/actions/organize";
import { parseRow, taskToCells, emptyCells, type RawCells } from "@/lib/domain/gridRow";
import type { EventCtx } from "@/lib/domain/cells";
import type { GridTask } from "@/lib/repository/organize";
import { parseTsv, applyPaste } from "@/lib/domain/paste";
import { GridRow, GRID_COLUMNS, type RowState } from "@/components/organize/GridRow";

interface GridEvent {
  id: string; name: string; status: "draft" | "published"; startDate: Date; endDate: Date;
}

function toParts(d: Date) {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function OrganizeGrid({ event, initialTasks }: { event: GridEvent; initialTasks: GridTask[] }) {
  const ctx: EventCtx = {
    year: event.startDate.getUTCFullYear(),
    start: toParts(event.startDate), end: toParts(event.endDate),
  };
  const [rows, setRows] = useState<RowState[]>(() =>
    initialTasks.map((t) => ({
      key: crypto.randomUUID(), taskId: t.id, cells: taskToCells(t),
      signupCount: t.signupCount, state: "saved", problem: null, expanded: false,
    })),
  );
  const [status, setStatus] = useState(event.status);
  const [deleted, setDeleted] = useState<
    { row: RowState; index: number; timer: ReturnType<typeof setTimeout> } | null
  >(null);
  const router = useRouter();
  // Always-current rows for async callbacks (order reconciliation after saves).
  const rowsRef = useRef<RowState[]>([]);
  useEffect(() => { rowsRef.current = rows; });

  // Cancel a pending delete-timer if the grid unmounts mid-undo-window.
  useEffect(() => {
    return () => { if (deleted) clearTimeout(deleted.timer); };
  }, [deleted]);

  const update = (key: string, fn: (r: RowState) => RowState) =>
    setRows((rs) => rs.map((r) => (r.key === key ? fn(r) : r)));

  function onCell(key: string, field: keyof RawCells, value: string) {
    update(key, (r) => ({ ...r, cells: { ...r.cells, [field]: value }, state: "dirty", problem: null }));
  }

  function onToggle(key: string) {
    update(key, (r) => ({ ...r, expanded: !r.expanded }));
  }

  async function persistRow(row: RowState) {
    const parsed = parseRow(row.cells, ctx);
    if (!parsed.ok) {
      update(row.key, (r) => ({ ...r, state: "invalid", problem: { field: parsed.field, error: parsed.error } }));
      return;
    }
    update(row.key, (r) => ({ ...r, state: "saving" }));
    try {
      const result = await saveTask({ eventId: event.id, taskId: row.taskId, cells: row.cells });
      if (result.ok) {
        update(row.key, (r) => ({ ...r, taskId: result.taskId, state: "saved", problem: null }));
        // A brand-new task is created at the end server-side. If its row isn't
        // last in the grid (it was reordered before saving), persist the visual
        // order so the board reflects where the organizer put it.
        if (row.taskId === null) {
          const order = rowsRef.current
            .map((r) => (r.key === row.key ? result.taskId : r.taskId))
            .filter((id): id is string => id !== null);
          if (order[order.length - 1] !== result.taskId) void reorderTasks(event.id, order);
        }
      } else {
        update(row.key, (r) => ({
          ...r, state: "error",
          problem: { field: (result.field as keyof RawCells) ?? "title", error: result.error },
        }));
      }
    } catch {
      update(row.key, (r) => ({
        ...r, state: "error",
        problem: { field: "title" as keyof RawCells, error: "Couldn't save — please retry." },
      }));
    }
  }

  function onBlurRow(key: string) {
    const row = rowsRef.current.find((r) => r.key === key);
    if (row && row.state === "dirty") persistRow(row).catch(() => {});
  }

  function addRow() {
    setRows((rs) => [...rs, {
      key: crypto.randomUUID(), taskId: null, cells: emptyCells(),
      signupCount: 0, state: "dirty", problem: null, expanded: false,
    }]);
  }

  function duplicateRow() {
    setRows((rs) => {
      const last = rs[rs.length - 1];
      if (!last) return rs;
      return [...rs, {
        key: crypto.randomUUID(), taskId: null, cells: { ...last.cells },
        signupCount: 0, state: "dirty", problem: null, expanded: false,
      }];
    });
  }

  function onFillDown(key: string, field: keyof RawCells) {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      if (i < 1) return rs;
      const above = rs[i - 1].cells[field];
      return rs.map((r, j) =>
        j === i ? { ...r, cells: { ...r.cells, [field]: above }, state: "dirty", problem: null } : r,
      );
    });
  }

  /** A prior pending delete commits now — one undo window at a time. */
  function flushPendingDelete() {
    setDeleted((d) => {
      if (d) {
        clearTimeout(d.timer);
        if (d.row.taskId) void deleteTask(d.row.taskId);
      }
      return null;
    });
  }

  function onDelete(key: string) {
    const index = rows.findIndex((r) => r.key === key);
    const row = rows[index];
    if (!row) return;
    if (row.signupCount > 0 &&
        !window.confirm(`"${row.cells.title}" has ${row.signupCount} signup(s). Delete it anyway?`)) {
      return;
    }
    flushPendingDelete();
    setRows((rs) => rs.filter((r) => r.key !== key));
    // The server delete is DEFERRED until the undo window closes, so Undo can
    // restore the row intact — task id, signups, claim tokens, everything.
    // (If the tab closes mid-window the delete never fires; the task survives
    // on reload — the safe failure.)
    const timer = setTimeout(() => {
      if (row.taskId) void deleteTask(row.taskId);
      setDeleted(null);
    }, 10_000);
    setDeleted({ row, index, timer });
  }

  function onUndoDelete() {
    setDeleted((d) => {
      if (!d) return null;
      clearTimeout(d.timer);
      setRows((rs) => {
        const copy = [...rs];
        copy.splice(Math.min(d.index, copy.length), 0, d.row);
        return copy;
      });
      return null;
    });
  }

  function onMove(key: string, delta: -1 | 1) {
    const i = rows.findIndex((r) => r.key === key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const copy = [...rows];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setRows(copy);
    const ids = copy.map((r) => r.taskId).filter((id): id is string => id !== null);
    void reorderTasks(event.id, ids);
  }

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    // A lone value (no rows/columns) types into the focused cell normally.
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();

    // Anchor at the focused cell so the paste lands where the organizer is
    // (column-aware): "copy the times column → click Time → paste".
    const el = e.target as HTMLElement;
    const anchorField = el?.dataset?.field as keyof RawCells | undefined;
    const anchorKey = el?.dataset?.rowkey;
    const order = GRID_COLUMNS.map((c) => c.field);
    const anchorRow = anchorKey
      ? Math.max(0, rows.findIndex((r) => r.key === anchorKey))
      : rows.length; // no focused cell → append at the end
    const anchorCol = anchorField ? Math.max(0, order.indexOf(anchorField)) : 0;

    const result = applyPaste(
      rows.map((r) => r.cells),
      parseTsv(text),
      { row: anchorRow, col: anchorCol },
      order,
      emptyCells,
    );

    // Map cells back to rows: keep key/taskId/signups for rows the paste
    // touched (mark them dirty), and mint fresh rows for any it appended.
    const next: RowState[] = result.cells.map((cells, i) => {
      const existing = rows[i];
      if (existing) {
        return result.affected.includes(i)
          ? { ...existing, cells, state: "dirty", problem: null }
          : existing;
      }
      return {
        key: crypto.randomUUID(), taskId: null, cells,
        signupCount: 0, state: "dirty", problem: null, expanded: false,
      };
    });
    setRows(next);

    // Autosave every touched row (valid ones persist; unparseable ones flag).
    const touched = result.affected.map((i) => next[i]);
    (async () => {
      for (const r of touched) await persistRow(r);
    })().catch(() => {});
  }

  async function toggleStatus() {
    const next = status === "published" ? "draft" : "published";
    const result = await setEventStatusAction(event.id, next);
    if (result.ok) { setStatus(next); router.refresh(); }
  }

  const saving = rows.some((r) => r.state === "saving");
  const attention = rows.filter((r) => r.state === "invalid" || r.state === "error").length;
  const chip = saving ? "Saving…" : attention > 0
    ? `${attention} row${attention > 1 ? "s" : ""} need${attention === 1 ? "s" : ""} attention`
    : "Saved ✓";

  return (
    <div onPaste={onPaste}>
      <div className={`mb-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
        status === "published" ? "border-amber/50 bg-amber/10" : "border-lily-line bg-lily/50"
      }`}>
        <p className="text-sm text-ink">
          {status === "published"
            ? <><strong>🏮 Live</strong> — volunteers see changes as you make them.</>
            : <><strong>🌱 Draft</strong> — only organizers can see this.</>}
        </p>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-sm text-ink-soft">{chip}</span>
          <button type="button" onClick={toggleStatus}
            className="rounded-xl bg-reed px-4 py-2 text-sm font-bold text-white transition hover:bg-reed-deep">
            {status === "published" ? "Close sign-ups" : "Open sign-ups"}
          </button>
        </div>
      </div>

      <div className="mb-1.5 flex gap-2 text-sm">
        <button type="button" onClick={addRow}
          className="rounded-lg border border-lily-line bg-white px-3 py-1.5 transition hover:border-reed">+ Add row</button>
        <button type="button" onClick={duplicateRow}
          className="rounded-lg border border-lily-line bg-white px-3 py-1.5 transition hover:border-reed">⧉ Duplicate last</button>
      </div>
      <p className="mb-2 text-xs text-ink-soft">
        Pasting from a sheet? Copy <span className="font-semibold text-ink">one column</span> (e.g. the task names),
        click the matching column here, and paste — it fills down. (⌘/Ctrl-D copies a cell down.)
        Open <span className="font-semibold text-ink">Details</span> on a row for description, contact, and what “done” looks like.
      </p>

      <table className="w-full border-separate border-spacing-0 rounded-2xl border border-lily-line bg-white text-left">
        <caption className="sr-only">Tasks for {event.name}</caption>
        <thead>
          <tr className="bg-lily text-xs font-bold uppercase tracking-wide text-ink">
            <th scope="col" className="w-6 rounded-tl-2xl p-2"><span className="sr-only">Reorder</span></th>
            <th scope="col" className="p-2">Details</th>
            {GRID_COLUMNS.map((c) => <th key={c.field} scope="col" className="p-2">{c.label}</th>)}
            <th scope="col" className="p-2"><span className="sr-only">Signups</span></th>
            <th scope="col" className="rounded-tr-2xl p-2"><span className="sr-only">Delete</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <GridRow key={row.key} row={row} index={i}
              onCell={onCell} onToggle={onToggle} onDelete={onDelete}
              onMove={onMove} onBlurRow={onBlurRow} onFillDown={onFillDown} />
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={12} className="p-6 text-center text-sm text-ink-soft">
              Add your tasks — type or paste from your sheet.
            </td></tr>
          )}
        </tbody>
      </table>

      {deleted && (
        <div role="status"
          className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
          Row deleted —
          <button type="button" onClick={onUndoDelete} className="font-bold text-reed underline-offset-2 hover:underline">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
