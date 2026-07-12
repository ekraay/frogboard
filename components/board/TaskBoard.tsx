"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { partitionByAvailability } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";
import { BoardCard } from "@/components/board/BoardCard";
import { TaskPanel } from "@/components/board/TaskPanel";

function Column({
  label,
  dot,
  tasks,
  onOpen,
}: {
  label: string;
  dot: string;
  tasks: BoardTask[];
  onOpen: (id: string) => void;
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
// they stay correct wherever the board is mounted.
export function TaskBoard({
  event,
  tasks,
  isOrganizer,
}: {
  event: { name: string };
  tasks: BoardTask[];
  isOrganizer: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { available, claimed } = partitionByAvailability(tasks);

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
    void navigator.clipboard.writeText(window.location.origin + window.location.pathname);
    setCopied(true);
  }

  const open = openId ? tasks.find((t) => t.id === openId) : undefined;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">
            <span aria-hidden className="mr-2">🐸</span>
            {event.name}
          </h1>
          <p className="mt-1 text-ink-soft">Grab a task to help out.</p>
        </div>
        {isOrganizer ? (
          <div className="flex items-center gap-3">
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

      <div className="grid gap-8 sm:grid-cols-2">
        <Column label="Available" dot="bg-lantern" tasks={available} onOpen={openTask} />
        <Column label="Claimed" dot="bg-reed" tasks={claimed} onOpen={openTask} />
      </div>

      {open && <TaskPanel task={open} onClose={closeTask} />}
    </main>
  );
}
