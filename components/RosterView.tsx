"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRsvpAction } from "@/app/actions/rsvp";
import type { RosterGroup, PatrolSummary, StatusCounts } from "@/lib/domain/roster";
import type { RsvpStatus, EffectiveStatus } from "@/lib/domain/rsvp";

const CHOICES: { value: RsvpStatus; label: string; icon: string }[] = [
  { value: "yes", label: "Yes", icon: "✓" },
  { value: "no", label: "No", icon: "✗" },
  { value: "maybe", label: "Maybe", icon: "?" },
];

const PILL: Record<EffectiveStatus, { label: string; cls: string }> = {
  yes: { label: "✓ Yes", cls: "text-reed-deep" },
  no: { label: "✗ No", cls: "text-lantern-deep" },
  maybe: { label: "? Maybe", cls: "text-ink-soft" },
  blank: { label: "no answer", cls: "text-ink-soft/70" },
};

function heardOf(c: StatusCounts): { heard: number; total: number } {
  return { heard: c.yes + c.maybe + c.no, total: c.yes + c.maybe + c.no + c.blank };
}

export function RosterView({ token, group, eventName, counts, byPatrol, roster }: {
  token: string; group: string; eventName: string;
  counts: StatusCounts; byPatrol: PatrolSummary[]; roster: RosterGroup[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { heard, total } = heardOf(counts);

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

      <table className="mt-5 w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
            <th className="py-1 pr-2 font-semibold">Patrol</th>
            <th className="px-2 py-1 text-right font-semibold">Heard</th>
            <th className="px-2 py-1 text-right font-semibold" title="Yes">✓</th>
            <th className="px-2 py-1 text-right font-semibold" title="No">✗</th>
            <th className="px-2 py-1 text-right font-semibold" title="Maybe">?</th>
          </tr>
        </thead>
        <tbody>
          <SummaryRow name="All" counts={counts} bold />
          {byPatrol.map((p) => (
            <SummaryRow key={p.subGroup} name={p.subGroup} leader={p.leader} counts={p.counts} />
          ))}
        </tbody>
      </table>

      {roster.length === 0 ? (
        <p className="mt-8 text-ink-soft">No one is in this group yet.</p>
      ) : (
        roster.map((g) => (
          <section key={g.subGroup} className="mt-6">
            <h2 className="mb-2 font-display text-lg font-bold text-ink">{g.subGroup}</h2>
            <ul className="space-y-2">
              {g.people.map((p) => (
                <li key={p.id} className="rounded-2xl border border-lily-line bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className={p.position === "PL" ? "font-bold text-ink" : "font-medium text-ink"}>{p.name}</span>
                      {p.position && <span className="text-xs text-ink-soft"> · {p.position}</span>}
                      <span className={`ml-2 text-xs font-semibold ${PILL[p.status].cls}`}>{PILL[p.status].label}</span>
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

function SummaryRow({ name, leader, counts, bold }: {
  name: string; leader?: string | null; counts: StatusCounts; bold?: boolean;
}) {
  const { heard, total } = heardOf(counts);
  return (
    <tr className="border-t border-lily-line">
      <td className="py-1 pr-2">
        <span className={bold ? "font-bold text-ink" : "font-medium text-ink"}>{name}</span>
        {leader && <span className="block text-xs text-ink-soft">PL {leader}</span>}
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-ink">{heard} / {total}</td>
      <td className="px-2 py-1 text-right tabular-nums text-reed-deep">{counts.yes}</td>
      <td className="px-2 py-1 text-right tabular-nums text-lantern-deep">{counts.no}</td>
      <td className="px-2 py-1 text-right tabular-nums text-ink-soft">{counts.maybe}</td>
    </tr>
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
