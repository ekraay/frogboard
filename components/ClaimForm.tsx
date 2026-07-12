"use client";

import { useState } from "react";
import { ClaimFields } from "@/components/ClaimFields";

// The board's inline claim affordance: a "Grab a frog" button that expands into
// the shared ClaimFields. The task panel skips the button and renders
// ClaimFields directly, so claim behavior lives in one place.
export function ClaimForm({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);

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

  return (
    <div className="mt-4">
      <ClaimFields taskId={taskId} onClaimed={() => setOpen(false)} onCancel={() => setOpen(false)} />
    </div>
  );
}
