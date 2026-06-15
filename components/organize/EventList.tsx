"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEventStatusAction, deleteEventAction } from "@/app/actions/organize";
import type { EventListItem } from "@/lib/repository/organize";

export function EventList({ events }: { events: EventListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = events.filter((e) => e.status !== "archived");
  const archived = events.filter((e) => e.status === "archived");

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => { await fn(); router.refresh(); });
  }

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
            <button
              type="button"
              disabled={pending}
              aria-label={`Archive ${e.name}`}
              onClick={() => run(() => setEventStatusAction(e.id, "archived"))}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-lily disabled:opacity-50"
            >
              Archive
            </button>
          </li>
        ))}
        {active.length === 0 && (
          <li className="text-ink-soft">No events yet — create the first one below.</li>
        )}
      </ul>

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-ink-soft hover:text-ink">
            Archived ({archived.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {archived.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-lily-line bg-lily/30 px-4 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium text-ink-soft">{e.name}</span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Restore ${e.name}`}
                    onClick={() => run(() => setEventStatusAction(e.id, "draft"))}
                    className="rounded-lg px-3 py-1.5 font-semibold text-pond transition hover:bg-white disabled:opacity-50"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Delete ${e.name}`}
                    onClick={() => {
                      if (window.confirm(`Permanently delete “${e.name}” and all its tasks and signups? This can't be undone.`)) {
                        run(() => deleteEventAction(e.id));
                      }
                    }}
                    className="rounded-lg px-3 py-1.5 font-semibold text-lantern-deep transition hover:bg-lantern/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
