"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveTask, deleteTask, clearTasks, reorderTasks, setEventStatusAction } from "@/app/actions/organize";
import { parseRow, taskToCells, emptyCells, type RawCells } from "@/lib/domain/gridRow";
import { sortRowKeys, type SortColumn } from "@/lib/domain/gridSort";
import type { EventCtx } from "@/lib/domain/cells";
import type { GridTask } from "@/lib/repository/organize";
import { parseTsv, applyPaste } from "@/lib/domain/paste";
import { GridRow, GRID_COLUMNS, type RowState } from "@/components/organize/GridRow";
import { PasteTasksDialog } from "@/components/organize/PasteTasksDialog";
import { HelpPopover } from "@/components/organize/HelpPopover";
import { SlugEditor } from "@/components/organize/SlugEditor";

interface GridEvent {
  id: string; name: string; status: "draft" | "published" | "archived"; slug: string | null;
  startDate: Date | null; endDate: Date | null; standing: boolean;
}

type Pending =
  | { kind: "row"; row: RowState; index: number; timer: ReturnType<typeof setTimeout> }
  // A "clear" has no auto-dismiss timer: its inline banner persists until you
  // Undo or take the next grid action (add/paste), which commits the delete.
  | { kind: "clear"; rows: RowState[]; taskIds: string[] };

function toParts(d: Date) {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function OrganizeGrid({ event, initialTasks }: { event: GridEvent; initialTasks: GridTask[] }) {
  const ctx: EventCtx = event.startDate && event.endDate
    ? { year: event.startDate.getUTCFullYear(), start: toParts(event.startDate), end: toParts(event.endDate) }
    : (() => {
        const year = new Date().getUTCFullYear();
        return { year, start: { year, month: 1, day: 1 }, end: { year, month: 12, day: 31 } };
      })();
  const newCells = () => ({ ...emptyCells(), kind: event.standing ? "errand" : "shift" });
  const [rows, setRows] = useState<RowState[]>(() =>
    initialTasks.map((t) => ({
      key: crypto.randomUUID(), taskId: t.id, cells: taskToCells(t),
      signupCount: t.signupCount, state: "saved", problem: null, expanded: false,
    })),
  );
  const [status, setStatus] = useState(event.status);
  const [editingLink, setEditingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasting, setPasting] = useState(false);
  // One undo window at a time, for either a single-row delete or a whole-grid
  // "Clear all". The server delete is DEFERRED for both, so Undo restores the
  // rows intact (no delete fired yet).
  const [pending, setPending] = useState<Pending | null>(null);
  const [sort, setSort] = useState<{ column: SortColumn; dir: 1 | -1 } | null>(null);
  const [sortedKeys, setSortedKeys] = useState<string[] | null>(null);
  const router = useRouter();
  // Always-current rows for async callbacks (order reconciliation after saves).
  const rowsRef = useRef<RowState[]>([]);
  useEffect(() => { rowsRef.current = rows; });

  // Cancel a pending row-delete timer if the grid unmounts mid-undo-window.
  useEffect(() => {
    return () => { if (pending?.kind === "row") clearTimeout(pending.timer); };
  }, [pending]);

  // Cmd/Ctrl+Z reverses the last delete/clear -- but only when you're NOT editing
  // a cell, where the browser's own text-undo should win. A ref keeps the latest
  // onUndo so the listener can mount once.
  const undoRef = useRef<() => void>(() => {});
  useEffect(() => { undoRef.current = onUndo; });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      undoRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const update = (key: string, fn: (r: RowState) => RowState) =>
    setRows((rs) => rs.map((r) => (r.key === key ? fn(r) : r)));

  function onSort(column: SortColumn) {
    const dir: 1 | -1 = sort && sort.column === column ? (sort.dir === 1 ? -1 : 1) : 1;
    setSort({ column, dir });
    setSortedKeys(sortRowKeys(rows.map((r) => ({ key: r.key, cells: r.cells })), column, dir, ctx));
  }
  function toManual() { setSort(null); setSortedKeys(null); }

  const displayedRows = sortedKeys
    ? sortedKeys.map((k) => rows.find((r) => r.key === k)).filter((r): r is RowState => !!r)
    : rows;

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
        problem: { field: "title" as keyof RawCells, error: "Couldn't save -- please retry." },
      }));
    }
  }

  function onBlurRow(key: string) {
    const row = rowsRef.current.find((r) => r.key === key);
    if (row && row.state === "dirty") persistRow(row).catch(() => {});
  }

  function addRow() {
    toManual();
    flushPending(); // adding a row is the "next action" that commits a pending Clear-all
    setRows((rs) => [...rs, {
      key: crypto.randomUUID(), taskId: null, cells: newCells(),
      signupCount: 0, state: "dirty", problem: null, expanded: false,
    }]);
  }

  function duplicateRow() {
    toManual();
    flushPending();
    setRows((rs) => {
      const last = rs[rs.length - 1];
      if (!last) return rs;
      return [...rs, {
        key: crypto.randomUUID(), taskId: null, cells: { ...last.cells },
        signupCount: 0, state: "dirty", problem: null, expanded: false,
      }];
    });
  }

  // "Paste a list" modal: each pasted task (name + detected time/count/...) is
  // appended and saved.
  function addManyTasks(cells: RawCells[]) {
    toManual();
    flushPending();
    const newRows: RowState[] = cells.map((c) => ({
      key: crypto.randomUUID(), taskId: null, cells: c,
      signupCount: 0, state: "dirty", problem: null, expanded: false,
    }));
    setRows((rs) => [...rs, ...newRows]);
    setPasting(false);
    (async () => {
      for (const r of newRows) await persistRow(r);
    })().catch(() => {});
  }

  /** Spreadsheet "fill down": copy this cell's value into the EMPTY cells below
   *  it in the same column -- never overwriting one that already has a value, so
   *  there's nothing to undo. Saves just the rows it actually fills. */
  function onFillDown(key: string, field: keyof RawCells) {
    const i = rows.findIndex((r) => r.key === key);
    if (i < 0) return;
    const value = rows[i].cells[field];
    if (value.trim() === "") return; // nothing to fill from
    const filled: RowState[] = [];
    const updated = rows.map((r, j) => {
      if (j > i && r.cells[field].trim() === "") {
        const next = { ...r, cells: { ...r.cells, [field]: value }, state: "dirty" as const, problem: null };
        filled.push(next);
        return next;
      }
      return r;
    });
    setRows(updated);
    (async () => { for (const r of filled) await persistRow(r); })().catch(() => {});
  }

  /** Fire the deferred server delete for whatever's pending (row or clear). */
  function commitPending(p: Pending) {
    if (p.kind === "row") {
      if (p.row.taskId) void deleteTask(p.row.taskId);
    } else if (p.taskIds.length) {
      // Delete only the captured ids -- rows added during the window are safe.
      void clearTasks(event.id, p.taskIds);
    }
  }

  /** A prior pending delete commits now -- one undo window at a time. */
  function flushPending() {
    if (!pending) return;
    if (pending.kind === "row") clearTimeout(pending.timer);
    commitPending(pending);
    setPending(null);
  }

  function onDelete(key: string) {
    const index = rows.findIndex((r) => r.key === key);
    const row = rows[index];
    if (!row) return;
    if (row.signupCount > 0 &&
        !window.confirm(`"${row.cells.title}" has ${row.signupCount} signup(s). Delete it anyway?`)) {
      return;
    }
    flushPending();
    setRows((rs) => rs.filter((r) => r.key !== key));
    // The server delete is DEFERRED until the undo window closes, so Undo can
    // restore the row intact -- task id, signups, claim tokens, everything.
    // (If the tab closes mid-window the delete never fires; the task survives
    // on reload -- the safe failure.)
    const timer = setTimeout(() => {
      if (row.taskId) void deleteTask(row.taskId);
      setPending(null);
    }, 10_000);
    setPending({ kind: "row", row, index, timer });
  }

  /** "Start over": wipe every row. The delete is DEFERRED and undoable -- a
   *  persistent inline banner offers Undo, and the actual delete commits only
   *  when you take the next grid action (add/paste) or delete again. Leaving the
   *  page without acting never fires it (the safe failure). */
  function onClearAll() {
    const snapshot = rows;
    const n = snapshot.length;
    if (n === 0) return;
    if (!window.confirm(`Clear all ${n} task${n === 1 ? "" : "s"}? You can undo afterward.`)) return;
    flushPending();
    const taskIds = snapshot.map((r) => r.taskId).filter((id): id is string => id !== null);
    setRows([]);
    setPending({ kind: "clear", rows: snapshot, taskIds });
  }

  function onUndo() {
    const p = pending;
    if (!p) return;
    if (p.kind === "row") {
      clearTimeout(p.timer);
      setRows((rs) => {
        const copy = [...rs];
        copy.splice(Math.min(p.index, copy.length), 0, p.row);
        return copy;
      });
    } else {
      // Restore the cleared rows ahead of anything added during the window.
      setRows((rs) => [...p.rows, ...rs]);
    }
    setPending(null);
  }

  function onMove(key: string, delta: -1 | 1) {
    if (sortedKeys !== null) return;
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
    // Only intercept a paste that landed in a grid CELL. Anything else -- most
    // importantly the "Paste a list" modal's textarea, which renders inside
    // this wrapper -- handles its own paste natively.
    const el = e.target as HTMLElement;
    const anchorField = el?.dataset?.field as keyof RawCells | undefined;
    const anchorKey = el?.dataset?.rowkey;
    if (!anchorField || !anchorKey) return;

    const text = e.clipboardData.getData("text/plain");
    // A lone value (no rows/columns) types into the focused cell normally.
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    flushPending(); // a grid paste is a "next action" that commits a pending Clear-all

    // Anchor at the focused cell so the paste lands where the organizer is
    // (column-aware): "copy the times column -> click Time -> paste".
    const order = GRID_COLUMNS.map((c) => c.field);
    const anchorRow = Math.max(0, rows.findIndex((r) => r.key === anchorKey));
    const anchorCol = Math.max(0, order.indexOf(anchorField));

    const result = applyPaste(
      rows.map((r) => r.cells),
      parseTsv(text),
      { row: anchorRow, col: anchorCol },
      order,
      newCells,
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
  const chip = saving ? "Saving..." : attention > 0
    ? `${attention} row${attention > 1 ? "s" : ""} need${attention === 1 ? "s" : ""} attention`
    : "Saved ✓";

  const publicParam = event.slug ?? event.id;
  const shownUrl = `frogboard.vercel.app/${event.slug ?? (status === "published" ? event.id : "…")}`;
  function copyLink() {
    const base = typeof window === "undefined" ? "" : window.location.origin;
    void navigator.clipboard?.writeText(`${base}/${publicParam}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div onPaste={onPaste}>
      <datalist id="grid-areas">
        {[...new Set(rows.map((r) => r.cells.category.trim()).filter(Boolean))].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className={`mb-4 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 ${
        status === "published" ? "border-amber/50 bg-amber/10" : "border-lily-line bg-lily/50"
      }`}>
        <div className="min-w-0">
          <p className="text-sm text-ink">
            {status === "published" ? (
              <>
                <strong>🏮 Live</strong> at{" "}
                <a href={`/${publicParam}`} target="_blank" rel="noopener noreferrer"
                  className="font-medium text-reed-deep underline-offset-2 hover:underline">
                  {shownUrl} ↗
                </a>
              </>
            ) : (
              <><strong>🌱 Draft</strong> · will publish to {shownUrl}</>
            )}
          </p>
          <div className="mt-1 flex items-center gap-3 text-sm">
            <button type="button" onClick={copyLink}
              className="font-medium text-pond underline-offset-2 hover:underline">
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <button type="button" onClick={() => setEditingLink((v) => !v)}
              className="font-medium text-pond underline-offset-2 hover:underline">
              Edit link
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span aria-live="polite" className="text-sm text-ink-soft">{chip}</span>
          <button type="button" onClick={toggleStatus}
            className="rounded-xl bg-reed px-4 py-2 text-sm font-bold text-white transition hover:bg-reed-deep">
            {status === "published" ? "Close sign-ups" : "Open sign-ups"}
          </button>
        </div>
      </div>
      {editingLink && (
        <div className="mb-4">
          <SlugEditor eventId={event.id} slug={event.slug} onSaved={() => setEditingLink(false)} />
        </div>
      )}

      <div className="mb-2.5 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1">
          <button type="button" onClick={() => setPasting(true)}
            className="rounded-lg bg-reed/10 px-3 py-1.5 font-semibold text-reed-deep transition hover:bg-reed/20">📋 Paste a list</button>
          <HelpPopover label={`How “Paste a list” works`}>
            Each line becomes a task. To bring a column from your sheet, copy it, click the
            matching column here, and paste. Open <span className="font-semibold">Details</span> on
            a row for description, contact, and what &ldquo;done&rdquo; looks like.
          </HelpPopover>
        </span>
        <button type="button" onClick={addRow}
          className="rounded-lg border border-lily-line bg-white px-3 py-1.5 transition hover:border-reed">+ Add row</button>
        <button type="button" onClick={duplicateRow}
          className="rounded-lg border border-lily-line bg-white px-3 py-1.5 transition hover:border-reed">⧉ Duplicate last</button>
        {sortedKeys && (
          <button type="button" onClick={toManual}
            className="rounded-lg border border-reed/40 bg-reed/5 px-3 py-1.5 font-semibold text-reed-deep transition hover:bg-reed/15">
            ↕ Manual order
          </button>
        )}
        {pending && (
          <button type="button" onClick={onUndo} aria-label="Undo last change" title="Undo last change (⌘Z)"
            className="rounded-lg border border-reed/40 bg-reed/5 px-3 py-1.5 font-semibold text-reed-deep transition hover:bg-reed/15">⟲ Undo</button>
        )}
        {rows.length > 0 && (
          <button type="button" onClick={onClearAll}
            className="ml-auto rounded-lg border border-lily-line bg-white px-3 py-1.5 text-ink-soft transition hover:border-lantern-deep hover:text-lantern-deep">🧹 Clear all</button>
        )}
      </div>

      {pasting && <PasteTasksDialog onAdd={addManyTasks} onClose={() => setPasting(false)} blank={newCells} />}

      {pending?.kind === "clear" && (
        <div role="status"
          className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber/60 bg-amber/15 px-4 py-3">
          <span className="text-sm font-medium text-ink">
            🧹 Cleared {pending.rows.length} task{pending.rows.length === 1 ? "" : "s"}. They&rsquo;re off the board &mdash;
            bring them back if that wasn&rsquo;t right.
          </span>
          <button type="button" onClick={onUndo}
            className="shrink-0 rounded-xl bg-reed px-4 py-2 text-sm font-bold text-white transition hover:bg-reed-deep">
            Undo
          </button>
        </div>
      )}

      <table className="w-full border-separate border-spacing-0 rounded-2xl border border-lily-line bg-white text-left">
        <caption className="sr-only">Tasks for {event.name}</caption>
        <thead>
          <tr className="bg-lily text-xs font-bold uppercase tracking-wide text-ink">
            <th scope="col" className="w-6 rounded-tl-2xl p-2"><span className="sr-only">Reorder</span></th>
            <th scope="col" className="p-2">Details</th>
            {GRID_COLUMNS.map((c) => {
              const active = sort?.column === c.field;
              const ariaSort = active ? (sort!.dir === 1 ? "ascending" : "descending") : "none";
              return (
                <th key={c.field} scope="col" className="p-2" aria-sort={ariaSort as "ascending" | "descending" | "none"}>
                  <button type="button" onClick={() => onSort(c.field as SortColumn)}
                    className="inline-flex items-center gap-1 hover:text-lantern-deep"
                    aria-label={`Sort by ${c.label}`}>
                    {c.label}
                    <span aria-hidden className={active ? "text-lantern" : "opacity-0"}>
                      {active && sort!.dir === -1 ? "▼" : "▲"}
                    </span>
                  </button>
                  {c.field === "kind" && (
                    <> <HelpPopover label="Shift vs Task">
                      A <span className="font-semibold">Shift</span> is a scheduled time slot. A{" "}
                      <span className="font-semibold">🪷 Task</span> is a one-off need volunteers grab.
                      It can take a &ldquo;by&rdquo; deadline instead of a time.
                    </HelpPopover></>
                  )}
                </th>
              );
            })}
            <th scope="col" className="p-2"><span className="sr-only">Signups</span></th>
            <th scope="col" className="rounded-tr-2xl p-2"><span className="sr-only">Delete</span></th>
          </tr>
        </thead>
        <tbody>
          {displayedRows.map((row, i) => (
            <GridRow key={row.key} row={row} index={i}
              onCell={onCell} onToggle={onToggle} onDelete={onDelete}
              onMove={onMove} onBlurRow={onBlurRow} onFillDown={onFillDown}
              reorderDisabled={sortedKeys !== null} />
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={12} className="p-6 text-center text-sm text-ink-soft">
              Add your tasks &mdash; type or paste from your sheet.
            </td></tr>
          )}
        </tbody>
      </table>

      {pending?.kind === "row" && (
        <div role="status"
          className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
          Row deleted &mdash;
          <button type="button" onClick={onUndo} className="font-bold text-reed underline-offset-2 hover:underline">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
