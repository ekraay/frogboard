"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revertChange } from "@/app/actions/organize";

/** Undo one logged change. Restores are lossless (signups and their tokens come back). */
export function RevertButton({ auditId, label }: { auditId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    if (!window.confirm(`Undo this change?\n\n${label}`)) return;
    setError(null);
    startTransition(async () => {
      const result = await revertChange(auditId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span role="alert" className="text-xs font-medium text-lantern">{error}</span>}
      <button type="button" onClick={onClick} disabled={pending}
        className="rounded-lg border border-lily-line px-2 py-1 text-xs font-medium text-pond transition hover:bg-pond/5 disabled:opacity-60">
        {pending ? "Reverting…" : "Revert"}
      </button>
    </span>
  );
}
