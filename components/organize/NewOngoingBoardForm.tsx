"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStandingBoardAction } from "@/app/actions/organize";

export function NewOngoingBoardForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createStandingBoardAction(formData);
      if (result.ok) router.push(`/organize/${result.eventId}`);
      else setError(result.error);
    });
  }

  const input = "mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30";
  return (
    <form action={onSubmit} className="mt-4 space-y-3 rounded-2xl border border-lily-line bg-lily/40 p-4">
      <h2 className="font-display text-lg font-bold text-ink">New ongoing board</h2>
      <p className="text-xs text-ink-soft">An evergreen list of frogs (chores, supplies) with no dates.</p>
      <label className="block text-sm font-bold text-ink">Board name
        <input name="name" className={input} placeholder="Temple needs" />
      </label>
      {error && <p role="alert" className="text-sm font-medium text-lantern-deep">{error}</p>}
      <button type="submit" disabled={pending}
        className="rounded-xl bg-reed px-4 py-2 font-bold text-white transition hover:bg-reed-deep disabled:opacity-60">
        {pending ? "Creating…" : "Create board"}
      </button>
    </form>
  );
}
