"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { partitionByAvailability, facetOptions } from "@/lib/domain/board";
import {
  applyBoardFilters, filtersToQuery, effectiveWhen, sortByGap,
  emptyFilters, type BoardFilters,
} from "@/lib/domain/boardFilters";
import type { BoardTask } from "@/lib/domain/types";
import { BoardCard } from "@/components/board/BoardCard";
import { TaskPanel } from "@/components/board/TaskPanel";
import { FilterFlyout } from "@/components/board/FilterFlyout";
import { ActiveFilterBar } from "@/components/board/ActiveFilterBar";

function Column({
  label, dot, tasks, onOpen,
}: {
  label: string; dot: string; tasks: BoardTask[]; onOpen: (id: string) => void;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-ink-soft">{label}</h2>
        <span className="rounded-full bg-lily px-2 py-0.5 text-xs font-bold text-ink-soft">{tasks.length}</span>
      </div>
      {tasks.map((t) => (
        <BoardCard key={t.id} task={t} onOpen={onOpen} />
      ))}
    </section>
  );
}

// The volunteer board: tasks split into Available and Claimed, each card opening
// a detail/claim panel. The open panel mirrors the URL hash (#task-<id>) so a
// card is shareable and back/forward works. Links come from window.location, so
// they stay correct wherever the board is mounted. Filters narrow which tasks
// show and stay in sync with the URL query, so a filtered link is shareable too.
export function TaskBoard({
  event, tasks, isOrganizer, initialFilters, nowMs,
}: {
  event: { name: string };
  tasks: BoardTask[];
  isOrganizer: boolean;
  initialFilters: BoardFilters;
  nowMs: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [filters, setFilters] = useState<BoardFilters>(initialFilters);
  const [flyoutOpen, setFlyoutOpen] = useState(false);

  const now = new Date(nowMs); // one clock: SSR and hydration agree
  const facets = facetOptions(tasks);
  const showDueSoon = tasks.some((t) => effectiveWhen(t) !== null);
  const showBigGap = tasks.some((t) => t.neededCount >= 2);

  const visible = applyBoardFilters(tasks, filters, now);
  const { available, claimed } = partitionByAvailability(visible);
  // When the Biggest gap filter is on, float the largest needs to the top of Available.
  const availableOrdered = filters.bigGap ? sortByGap(available) : available;

  const activeCount =
    (filters.keyword.trim() ? 1 : 0) + filters.group.length + filters.category.length +
    filters.location.length + filters.date.length + (filters.dueSoon ? 1 : 0) + (filters.bigGap ? 1 : 0);

  function syncUrl(next: BoardFilters) {
    const q = filtersToQuery(next);
    window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : "") + window.location.hash);
  }
  function changeFilters(next: BoardFilters) {
    setFilters(next);
    syncUrl(next);
  }
  function removeFilter(section: keyof BoardFilters, item?: string) {
    if (section === "keyword") return changeFilters({ ...filters, keyword: "" });
    if (section === "dueSoon") return changeFilters({ ...filters, dueSoon: false });
    if (section === "bigGap") return changeFilters({ ...filters, bigGap: false });
    const list = filters[section] as string[];
    changeFilters({ ...filters, [section]: list.filter((v) => v !== item) });
  }

  useEffect(() => {
    const ids = new Set(tasks.map((t) => t.id));
    const read = () => {
      const m = window.location.hash.match(/^#task-(.+)$/);
      setOpenId(m && ids.has(m[1]) ? m[1] : null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [tasks]);

  function openTask(id: string) {
    setOpenId(id);
    if (window.location.hash !== `#task-${id}`) window.location.hash = `task-${id}`;
  }

  function closeTask() {
    setOpenId(null);
    // Drop the fragment without pushing a history entry.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  function copyLink() {
    const q = filtersToQuery(filters);
    void navigator.clipboard.writeText(window.location.origin + window.location.pathname + (q ? `?${q}` : ""));
    setCopied(true);
  }

  const open = openId ? tasks.find((t) => t.id === openId) : undefined;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">
            <span aria-hidden className="mr-2">🐸</span>
            {event.name}
          </h1>
          <p className="mt-1 text-ink-soft">Grab a task to help out.</p>
          <details className="group mt-2 max-w-sm text-sm">
            <summary id="whats-a-pad" className="inline-flex scroll-mt-16 cursor-pointer list-none items-center gap-1 font-semibold text-pond underline-offset-4 hover:underline">
              🪷 What&apos;s a lily pad?
              <span aria-hidden className="text-xs transition group-open:rotate-180">▾</span>
            </summary>
            <p className="mt-2 leading-relaxed text-ink-soft">
              A <strong className="text-ink">lily pad</strong> is anything that needs a volunteer. A{" "}
              <strong className="text-ink">task</strong> is a one-off, like &ldquo;bring 50 paper cups.&rdquo; A{" "}
              <strong className="text-ink">shift</strong> is a scheduled time slot at a booth.
            </p>
          </details>
        </div>
        {isOrganizer ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/organize"
              className="text-sm font-medium text-ink-soft underline-offset-2 transition hover:text-pond hover:underline"
            >
              Organize
            </Link>
            <button
              type="button"
              onClick={copyLink}
              className="rounded-full bg-lily px-4 py-2 text-sm font-semibold text-pond-deep transition hover:bg-lily-line"
            >
              {copied ? "Copied ✓" : "🔗 Copy public link"}
            </button>
            <span className="rounded-full bg-reed/10 px-3 py-2 text-sm font-bold text-reed-deep">
              Live · {tasks.length} tasks
            </span>
          </div>
        ) : (
          <Link
            href="/organize"
            className="text-sm font-medium text-ink-soft underline-offset-2 transition hover:text-pond hover:underline"
          >
            Organizer sign-in
          </Link>
        )}
      </header>

      <div id="board" className="mb-4 scroll-mt-16">
        <button
          type="button"
          onClick={() => setFlyoutOpen(true)}
          className="rounded-full border border-lily-line bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:border-pond"
        >
          ⚙ Filter{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
      </div>

      <ActiveFilterBar value={filters} facets={facets} onRemove={removeFilter} onClear={() => changeFilters(emptyFilters())} />

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-lily-line bg-white p-8 text-center text-ink-soft">
          No tasks match.{" "}
          <button type="button" onClick={() => changeFilters(emptyFilters())} className="font-semibold text-pond hover:underline">
            Show all tasks
          </button>
        </p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2">
          <Column label="Available" dot="bg-lantern" tasks={availableOrdered} onOpen={openTask} />
          <Column label="Claimed" dot="bg-reed" tasks={claimed} onOpen={openTask} />
        </div>
      )}

      {flyoutOpen && (
        <FilterFlyout
          facets={facets}
          showDueSoon={showDueSoon}
          showBigGap={showBigGap}
          value={filters}
          onChange={changeFilters}
          onClose={() => setFlyoutOpen(false)}
        />
      )}

      {open && <TaskPanel task={open} onClose={closeTask} />}
    </main>
  );
}
