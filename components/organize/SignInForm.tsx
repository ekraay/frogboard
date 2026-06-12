"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/app/actions/organize";

export function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <form action={onSubmit} className="mx-auto mt-16 max-w-sm space-y-4 rounded-3xl border border-lily-line bg-white p-6 shadow-sm">
      <h1 className="font-display text-2xl font-bold text-ink">🐸 Organizers</h1>
      <label className="block text-sm font-bold text-ink">
        Password
        <input
          type="password" name="password" autoFocus autoComplete="current-password"
          className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
      </label>
      {error && <p role="alert" className="rounded-lg bg-lantern/10 px-3 py-2 text-sm font-medium text-lantern">{error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-xl bg-reed py-2.5 font-bold text-white transition hover:bg-reed-deep disabled:opacity-60">
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
