import Link from "next/link";
import { ArchiveButton, ArchivedSection } from "@/components/organize/ArchiveControls";
import type { EventListItem } from "@/lib/repository/organize";

export function EventList({ events }: { events: EventListItem[] }) {
  const active = events.filter((e) => e.status !== "archived");
  const archived = events.filter((e) => e.status === "archived");

  return (
    <div className="mb-8">
      <ul className="space-y-3">
        {active.map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-1 rounded-2xl border border-lily-line bg-white pr-2 shadow-sm transition hover:border-reed"
          >
            <Link href={`/organize/${e.id}`} className="flex flex-1 items-center justify-between gap-3 p-4">
              <span className="font-bold text-ink">{e.name}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="text-ink-soft">{e.taskCount} tasks</span>
                {e.status === "published"
                  ? <span className="rounded-full bg-amber/20 px-3 py-1 font-bold text-lantern-deep">🏮 Sign-ups open</span>
                  : <span className="rounded-full bg-lily px-3 py-1 font-bold text-ink-soft">🌱 Draft</span>}
              </span>
            </Link>
            <ArchiveButton id={e.id} name={e.name} />
          </li>
        ))}
        {active.length === 0 && (
          <li className="text-ink-soft">No events yet. Create the first one below.</li>
        )}
      </ul>
      <ArchivedSection items={archived} />
    </div>
  );
}
