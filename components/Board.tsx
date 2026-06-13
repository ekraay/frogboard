import Link from "next/link";
import { groupTasksByDay } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";
import { TaskCard } from "@/components/TaskCard";

export function Board({ eventName, tasks }: { eventName: string; tasks: BoardTask[] }) {
  const groups = groupTasksByDay(tasks);
  let cardIndex = 0; // running count for a board-wide staggered reveal

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-7">
      <header className="mb-9 text-center">
        <div className="garland lantern-glow" aria-hidden>
          <span className="lantern" />
          <span className="lantern" />
          <span className="lantern" />
          <span className="lantern" />
          <span className="lantern" />
        </div>
        <p className="mb-1 text-2xl" aria-hidden>🐸</p>
        <h1 className="font-display text-[2rem] font-extrabold leading-[1.1] tracking-tight text-ink sm:text-4xl">
          {eventName}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
          Tap a lily pad to grab a frog. No account needed — just add your name.
        </p>
      </header>

      {groups.map((g) => (
        <section key={g.key} className="mb-10">
          <h2 className="mb-4 flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-lantern-deep">
            <span aria-hidden className="h-px w-10 bg-gradient-to-r from-transparent to-lantern/50" />
            <span aria-hidden className="text-[0.7rem]">🏮</span>
            {g.label}
            <span aria-hidden className="text-[0.7rem]">🏮</span>
            <span aria-hidden className="h-px w-10 bg-gradient-to-l from-transparent to-lantern/50" />
          </h2>
          <div className="space-y-4">
            {g.tasks.map((t) => (
              <TaskCard key={t.id} task={t} index={cardIndex++} />
            ))}
          </div>
        </section>
      ))}

      <footer className="mt-14 border-t border-lily-line/60 pt-6 text-center">
        <Link
          href="/organize"
          className="text-xs font-semibold text-ink-soft underline-offset-4 transition hover:text-pond hover:underline"
        >
          Organizers →
        </Link>
      </footer>
    </main>
  );
}
