"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createLeadAction, removeLeadAction, regenerateLeadTokenAction, importRosterAction,
} from "@/app/actions/leads";
import { parsePersonRows } from "@/lib/domain/roster";

type Lead = { id: string; group: string; name: string; token: string };

export function LeadsPanel({ eventId, groups, leads }: { eventId: string; groups: string[]; leads: Lead[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  function leadUrl(token: string) {
    const base = typeof window === "undefined" ? "" : window.location.origin;
    return `${base}/lead/${token}`;
  }
  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.error ?? "Something went wrong.");
    });
  }
  function onAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(() => createLeadAction(eventId, String(form.get("group") ?? ""), String(form.get("name") ?? "")));
  }

  return (
    <section className="rounded-2xl border border-lily-line bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Group leads</h2>
        <button type="button" onClick={() => setShowImport((v) => !v)}
          className="rounded-lg bg-pond px-3 py-1 text-sm font-bold text-white hover:opacity-90">
          Import roster
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-lantern-deep">{error}</p>}

      {showImport && <ImportForm eventId={eventId} pending={pending} onDone={() => { setShowImport(false); router.refresh(); }} onError={setError} />}

      <ul className="mt-3 space-y-2">
        {leads.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-lily-line px-3 py-2">
            <span className="text-sm text-ink"><span className="font-semibold">{l.name}</span> · {l.group}</span>
            <button type="button" disabled={pending} onClick={() => void navigator.clipboard?.writeText(leadUrl(l.token))}
              className="rounded-lg bg-reed px-3 py-1 text-sm font-bold text-white hover:bg-reed-deep disabled:opacity-60">Copy link</button>
            <button type="button" disabled={pending} onClick={() => run(() => regenerateLeadTokenAction(l.id, eventId))}
              className="rounded-lg px-3 py-1 text-sm font-bold text-pond underline underline-offset-2 disabled:opacity-60">Regenerate</button>
            <button type="button" disabled={pending} onClick={() => run(() => removeLeadAction(l.id, eventId))}
              className="rounded-lg px-3 py-1 text-sm font-bold text-lantern-deep underline underline-offset-2 disabled:opacity-60">Remove</button>
          </li>
        ))}
      </ul>

      <form onSubmit={onAssign} className="mt-3 flex flex-wrap items-center gap-2">
        <input name="group" list="lead-groups" aria-label="Group" placeholder="Group" required
          className="min-w-0 flex-1 rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
        <datalist id="lead-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        <input name="name" aria-label="Lead name" placeholder="Lead name" required
          className="min-w-0 flex-1 rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
        <button type="submit" disabled={pending}
          className="shrink-0 rounded-lg bg-reed px-3 py-1 text-sm font-bold text-white hover:bg-reed-deep disabled:opacity-60">Assign lead</button>
      </form>
    </section>
  );
}

function ImportForm({ eventId, pending, onDone, onError }: {
  eventId: string; pending: boolean; onDone: () => void; onError: (e: string) => void;
}) {
  const [group, setGroup] = useState("");
  const [text, setText] = useState("");
  const [youth, setYouth] = useState(true);
  const [busy, startTransition] = useTransition();
  const preview = useMemo(() => (text.trim() ? parsePersonRows(text).length : 0), [text]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await importRosterAction(eventId, group, text, youth);
      if (r.ok) onDone();
      else onError(r.error);
    });
  }
  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-lily-line bg-pond/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group name" placeholder="Group name (e.g. Scouts)" required
          className="min-w-0 flex-1 rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
        <label className="flex items-center gap-1 text-sm text-ink">
          <input type="checkbox" checked={youth} onChange={(e) => setYouth(e.target.checked)} /> youth roster
        </label>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label="Roster rows"
        placeholder="Paste rows from your sheet (First Name, Last Name, Patrol, Scout ID)"
        className="mt-2 w-full rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-ink-soft">{preview} people detected</span>
        <button type="submit" disabled={pending || busy || preview === 0}
          className="rounded-lg bg-reed px-3 py-1 text-sm font-bold text-white hover:bg-reed-deep disabled:opacity-60">Import</button>
      </div>
    </form>
  );
}
