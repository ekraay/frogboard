import Link from "next/link";
import type { AuditAction } from "@prisma/client";
import { summarizeAuditEntry, isRevertible } from "@/lib/domain/history";
import { HistoryTime } from "@/components/organize/HistoryTime";
import { RevertButton } from "@/components/organize/RevertButton";

export interface HistoryEntryView {
  id: string;
  action: AuditAction;
  actorName: string | null;
  details: unknown;
  createdAt: Date;
}

interface Props {
  eventName: string;
  eventId: string;
  entries: HistoryEntryView[];
}

export function EventHistory({ eventName, eventId, entries }: Props) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-extrabold text-ink">🐸 {eventName} history</h1>
        <Link href={`/organize/${eventId}`} className="text-sm font-medium text-pond underline-offset-2 hover:underline">
          ← Back to the grid
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-lily-line bg-white p-6 text-ink/70">No changes yet.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-4 rounded-2xl border border-lily-line bg-white px-4 py-3">
              <span className="font-medium text-ink">{summarizeAuditEntry(e)}</span>
              <span className="flex shrink-0 items-baseline gap-3 text-sm text-ink/60">
                <span>by {e.actorName ?? "an organizer"} · <HistoryTime iso={e.createdAt.toISOString()} /></span>
                {isRevertible(e.action) && <RevertButton auditId={e.id} label={summarizeAuditEntry(e)} />}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
