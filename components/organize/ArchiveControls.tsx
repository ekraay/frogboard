"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEventStatusAction, deleteEventAction } from "@/app/actions/organize";

// Shared archive lifecycle controls for /organize lists (dated events and
// ongoing boards). Each button or row owns its own transition, so acting on
// one item leaves the rest of the page clickable.
export function ArchiveButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Archive ${name}`}
      onClick={() => startTransition(async () => {
        await setEventStatusAction(id, "archived");
        router.refresh();
      })}
      className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-lily disabled:opacity-50"
    >
      Archive
    </button>
  );
}

export function ArchivedSection({ items }: { items: { id: string; name: string }[] }) {
  if (items.length === 0) return null;
  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-sm font-semibold text-ink-soft hover:text-ink">
        Archived ({items.length})
      </summary>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <ArchivedRow key={item.id} id={item.id} name={item.name} />
        ))}
      </ul>
    </details>
  );
}

// One transition per row: Restore and Delete disable together, so the same
// row can never run both at once.
function ArchivedRow({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(fn: () => Promise<unknown>) {
    startTransition(async () => { await fn(); router.refresh(); });
  }
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-lily-line bg-lily/30 px-4 py-2 text-sm">
      <span className="min-w-0 truncate font-medium text-ink-soft">{name}</span>
      <span className="flex shrink-0 gap-1">
        <button
          type="button"
          disabled={pending}
          aria-label={`Restore ${name}`}
          onClick={() => run(() => setEventStatusAction(id, "draft"))}
          className="rounded-lg px-3 py-1.5 font-semibold text-pond transition hover:bg-white disabled:opacity-50"
        >
          Restore
        </button>
        <button
          type="button"
          disabled={pending}
          aria-label={`Delete ${name}`}
          onClick={() => {
            if (window.confirm(`Permanently delete "${name}" and all its tasks and signups? This can't be undone.`)) {
              run(() => deleteEventAction(id));
            }
          }}
          className="rounded-lg px-3 py-1.5 font-semibold text-lantern-deep transition hover:bg-lantern/10 disabled:opacity-50"
        >
          Delete
        </button>
      </span>
    </li>
  );
}
