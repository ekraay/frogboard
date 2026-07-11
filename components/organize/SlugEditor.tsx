"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEventSlugAction } from "@/app/actions/organize";

/** Edit an event's public link slug, e.g. /ginza-2026. */
export function SlugEditor({ eventId, slug, onSaved }: { eventId: string; slug: string | null; onSaved?: () => void }) {
  const [value, setValue] = useState(slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateEventSlugAction(eventId, value);
      if (result.ok) { setValue(result.slug); setSaved(true); onSaved?.(); router.refresh(); }
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-lily-line bg-white px-4 py-3">
      <label htmlFor="slug" className="block text-sm font-bold text-ink">Public link</label>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-sm text-ink-soft">frogboard.vercel.app/</span>
        <input
          id="slug" name="slug" value={value} aria-label="Public link slug"
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          className="min-w-0 flex-1 rounded-xl border border-lily-line bg-white px-3 py-2 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
        <button type="submit" disabled={pending}
          className="shrink-0 rounded-xl bg-reed px-4 py-2 font-bold text-white transition hover:bg-reed-deep disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-lantern-deep">{error}</p>}
      {saved && !error && <p className="mt-2 text-sm font-medium text-reed">Saved.</p>}
    </form>
  );
}
