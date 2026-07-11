"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRsvpAction } from "@/app/actions/rsvp";
import type { ChaseGroup, StatusCounts } from "@/lib/domain/roster";
import type { RsvpStatus } from "@/lib/domain/rsvp";

const CHOICES: { value: RsvpStatus; label: string; icon: string }[] = [
  { value: "yes", label: "Yes", icon: "✓" },
  { value: "no", label: "No", icon: "✗" },
  { value: "maybe", label: "Maybe", icon: "?" },
];

export function ChaseView({ token, group, eventName, counts, chase }: {
  token: string; group: string; eventName: string; counts: StatusCounts; chase: ChaseGroup[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const total = counts.yes + counts.maybe + counts.no + counts.blank;
  const heard = total - counts.blank;

  function record(personId: string, status: RsvpStatus, reason: string | null) {
    setError(null);
    startTransition(async () => {
      const r = await setRsvpAction(token, personId, status, reason);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
      <p className="text-sm font-bold text-reed-deep">{group} · {eventName}</p>
      <h1 className="font-display text-2xl font-extrabold text-ink">
        Heard from {heard} of {total}
      </h1>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-lily-line" aria-hidden="true">
        <div className="h-full bg-reed" style={{ width: total ? `${(heard / total) * 100}%` : "0%" }} />
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-lantern-deep">{error}</p>}
      {chase.length === 0 ? (
        <p className="mt-8 text-ink-soft">All {total} accounted for 🎉</p>
      ) : (
        chase.map((g) => (
          <section key={g.subGroup} className="mt-6">
            <h2 className="mb-2 font-display text-lg font-bold text-ink">{g.subGroup}</h2>
            <ul className="space-y-2">
              {g.people.map((p) => (
                <li key={p.id} className="rounded-2xl border border-lily-line bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{p.name}</span>
                      {p.reason && <span className="block text-xs text-ink-soft">{p.reason}</span>}
                    </span>
                    <ReasonThenButtons pending={pending} onPick={(status, reason) => record(p.id, status, reason)} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="mt-8 text-sm text-ink-soft">Reminders are coming.</p>
    </main>
  );
}

function ReasonThenButtons({ pending, onPick }: {
  pending: boolean; onPick: (status: RsvpStatus, reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="flex shrink-0 items-center gap-1">
      {CHOICES.map((c) => (
        <button key={c.value} type="button" disabled={pending}
          onClick={() => onPick(c.value, c.value === "yes" ? null : reason.trim() || null)}
          aria-label={c.label}
          className="rounded-xl border border-lily-line px-3 py-2 text-sm font-bold text-ink hover:border-reed disabled:opacity-60">
          <span aria-hidden="true">{c.icon}</span> {c.label}
        </button>
      ))}
      <input value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason (optional)"
        placeholder="reason?"
        className="w-20 rounded-xl border border-lily-line px-2 py-2 text-xs text-ink outline-none focus:border-reed" />
    </div>
  );
}
