"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventAction } from "@/app/actions/organize";

export function NewEventForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createEventAction(formData);
      if (result.ok) router.push(`/organize/${result.eventId}`);
      else setError(result.error);
    });
  }

  const input = "mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30";
  return (
    <form action={onSubmit} className="space-y-3 rounded-2xl border border-lily-line bg-lily/40 p-4">
      <h2 className="font-display text-lg font-bold text-ink">New event</h2>
      <label className="block text-sm font-bold text-ink">Event name
        <input name="name" className={input} placeholder="Ginza Bazaar 2027" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-ink-soft">First day
          <input name="startDate" inputMode="numeric" autoComplete="off" placeholder="9/25/2026" className={input} />
        </label>
        <label className="block text-sm font-medium text-ink-soft">Last day
          <input name="endDate" inputMode="numeric" autoComplete="off" placeholder="9/27/2026" className={input} />
        </label>
      </div>
      <p className="text-xs text-ink-soft">Type the dates — &ldquo;9/25/2026&rdquo;, &ldquo;Sep 25 2026&rdquo;, or just &ldquo;9/25&rdquo;.</p>
      {error && <p role="alert" className="text-sm font-medium text-lantern-deep">{error}</p>}
      <button type="submit" disabled={pending}
        className="rounded-xl bg-reed px-4 py-2 font-bold text-white transition hover:bg-reed-deep disabled:opacity-60">
        {pending ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
