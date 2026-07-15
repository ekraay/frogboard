import Link from "next/link";
import type { StandingBoardItem } from "@/lib/repository/organize";

// Ongoing (evergreen) boards live outside the dated-event list, so the
// organizer index surfaces them here with a link back to each workspace.
export function StandingBoardList({ boards }: { boards: StandingBoardItem[] }) {
  if (boards.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="mb-3 font-display text-lg font-bold text-ink">Ongoing boards</h2>
      <ul className="space-y-3">
        {boards.map((b) => (
          <li
            key={b.id}
            className="flex items-center gap-1 rounded-2xl border border-lily-line bg-white pr-2 shadow-sm transition hover:border-reed"
          >
            <Link href={`/organize/${b.id}`} className="flex flex-1 items-center justify-between gap-3 p-4">
              <span className="font-bold text-ink">🪷 {b.name}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="text-ink-soft">{b.taskCount} tasks</span>
                {b.status === "published"
                  ? <span className="rounded-full bg-amber/20 px-3 py-1 font-bold text-lantern-deep">🏮 Live</span>
                  : <span className="rounded-full bg-lily px-3 py-1 font-bold text-ink-soft">🌱 Draft</span>}
              </span>
            </Link>
            {b.slug && (
              <Link
                href={`/${b.slug}`}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-pond transition hover:bg-lily"
              >
                View board
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
