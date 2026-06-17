import { getActiveEventBoard } from "@/lib/repository/events";
import { Board } from "@/components/Board";
import { filterTasksByGroup, coverageFor } from "@/lib/domain/board";

// The board reflects live signups; always render fresh.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const board = await getActiveEventBoard();

  if (!board) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center text-ink-soft">
        <p className="text-4xl" aria-hidden>🐸</p>
        <h1 className="mt-3 font-display text-2xl font-bold text-ink">No event yet</h1>
        <p className="mt-2">
          Run <code className="rounded bg-lily px-1.5 py-0.5 text-ink">npm run db:seed</code> to load one.
        </p>
      </main>
    );
  }

  // ?group=Scouts → a shareable, group-filtered board with a coverage header.
  const raw = (await searchParams).group;
  const group = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  if (group) {
    const tasks = filterTasksByGroup(board.tasks, group);
    const displayGroup = tasks[0]?.requestedGroup ?? group; // canonical casing when known
    return (
      <Board eventName={board.name} tasks={tasks}
        filter={{ group: displayGroup, ...coverageFor(tasks) }} />
    );
  }

  return <Board eventName={board.name} tasks={board.tasks} />;
}
