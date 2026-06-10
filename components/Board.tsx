import { groupTasksByDay } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";
import { TaskCard } from "@/components/TaskCard";

export function Board({ eventName, tasks }: { eventName: string; tasks: BoardTask[] }) {
  const groups = groupTasksByDay(tasks);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
      <header className="mb-8 text-center">
        <p className="mb-2 text-3xl" aria-hidden>🏮 🐸 🏮</p>
        <h1 className="font-display text-3xl font-extrabold leading-tight text-ink">
          {eventName}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          Tap a lily pad to grab a frog. No account needed — just add your name.
        </p>
      </header>

      {groups.map((g) => (
        <section key={g.key} className="mb-9">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-lantern">
            <span aria-hidden className="h-px flex-1 bg-lantern/30" />
            {g.label}
            <span aria-hidden className="h-px flex-1 bg-lantern/30" />
          </h2>
          <div className="space-y-4">
            {g.tasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
