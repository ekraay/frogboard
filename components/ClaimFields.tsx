"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimSlot } from "@/app/actions/signups";
import { rememberClaim } from "@/lib/client/ownership";
import { getProfile, rememberProfile } from "@/lib/client/profile";

/**
 * The claim form body: the fields, the `claimSlot` call, the device-local
 * remember-and-refresh. Rendered open (no button). `ClaimForm` wraps this behind
 * a "Hop to it" button for the old board; the task panel renders it directly.
 * One home for claim semantics so the two surfaces never diverge.
 */
export function ClaimFields({
  taskId,
  onClaimed,
  onCancel,
}: {
  taskId: string;
  onClaimed?: () => void;
  onCancel?: () => void;
}) {
  // Prefill from the last claim on this device so extra shifts are one tap.
  const [profile] = useState(getProfile);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    formData.set("taskId", taskId);
    startTransition(async () => {
      const result = await claimSlot(formData);
      if (result.ok) {
        rememberClaim(result.signupId, result.claimToken);
        rememberProfile({ name: String(formData.get("name") ?? ""), group: String(formData.get("group") ?? "") });
        router.refresh();
        onClaimed?.();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      action={onSubmit}
      className="space-y-3 rounded-2xl border border-lily-line bg-lily/60 p-4"
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
          defaultValue={profile.name}
          placeholder="e.g. Kenji"
          className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
      </label>
      <p className="text-xs text-ink-soft">Your name shows on the board so others know the spot&apos;s taken.</p>
      <label className="block text-sm font-medium text-ink-soft">
        Group <span className="font-normal">(optional)</span>
        <input
          name="group"
          maxLength={40}
          defaultValue={profile.group}
          placeholder="Scouts, YAO, BWA…"
          className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
      </label>
      <label className="block text-sm font-medium text-ink-soft">
        Email <span className="font-normal">(optional)</span>
        <input
          name="email"
          type="email"
          maxLength={120}
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
      </label>
      <label className="block text-sm font-medium text-ink-soft">
        Phone <span className="font-normal">(optional)</span>
        <input
          name="phone"
          type="tel"
          maxLength={30}
          autoComplete="tel"
          placeholder="(555) 555-1234"
          className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
      </label>
      <p className="text-xs text-ink-soft">We only use your email or phone to remind you about your shift.</p>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" name="minor" className="h-4 w-4 accent-reed" /> Under 18
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-lantern/10 px-3 py-2 text-sm font-medium text-lantern-deep">
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
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-lily-line px-4 py-2.5 font-medium text-ink-soft transition hover:bg-white"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
