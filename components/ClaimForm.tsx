"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimSlot } from "@/app/actions/signups";
import { rememberClaim } from "@/lib/client/ownership";

export function ClaimForm({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-reed py-3 text-base font-bold text-white shadow-[0_6px_0_0_var(--color-reed-deep)] transition active:translate-y-[3px] active:shadow-[0_3px_0_0_var(--color-reed-deep)] hover:bg-reed-deep"
      >
        <span aria-hidden className="text-lg transition group-hover:-translate-y-0.5">🐸</span>
        Grab a frog
      </button>
    );
  }

  function onSubmit(formData: FormData) {
    setError(null);
    formData.set("taskId", taskId);
    startTransition(async () => {
      const result = await claimSlot(formData);
      if (result.ok) {
        rememberClaim(result.signupId, result.claimToken);
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      action={onSubmit}
      className="mt-4 space-y-3 rounded-2xl border border-lily-line bg-lily/60 p-4"
    >
      {/* Honeypot: hidden from humans; bots fill it and get rejected. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
      <label className="block text-sm font-bold text-ink">
        Your name
        <input
          name="name"
          maxLength={80}
          placeholder="e.g. Kenji"
          className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
      </label>
      <label className="block text-sm font-medium text-ink-soft">
        Group <span className="font-normal">(optional)</span>
        <input
          name="group"
          maxLength={40}
          placeholder="Scouts, YAO, BWA…"
          className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" name="minor" className="h-4 w-4 accent-reed" /> Under 18
      </label>
      {error && (
        <p className="rounded-lg bg-lantern/10 px-3 py-2 text-sm font-medium text-lantern">
          {error}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-xl bg-reed py-2.5 font-bold text-white transition hover:bg-reed-deep disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add me"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-lily-line px-4 py-2.5 font-medium text-ink-soft transition hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
