"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getSlotInfo } from "@/lib/domain/board";
import { formatWhen } from "@/lib/domain/time";
import type { BoardTask } from "@/lib/domain/types";
import { ClaimFields } from "@/components/ClaimFields";

/** A read-only detail row, rendered only when the value is present. */
function Detail({ label, icon, value }: { label: string; icon: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">
        <span aria-hidden className="mr-1">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

// The task detail overlay: a labelled modal with the claim block (when open) and
// read-only details. Backdrop and Esc close it; focus lands on the dialog. Links
// derive from window.location so they stay correct wherever the board mounts.
export function TaskPanel({ task, onClose }: { task: BoardTask; onClose: () => void }) {
  const slot = getSlotInfo(task);
  const isFrog = task.kind === "mission";
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function share() {
    const url = window.location.origin + window.location.pathname + `#task-${task.id}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
  }

  const accentBar = slot.isFull ? "bg-reed" : "bg-lantern";
  const claimVerb = isFrog ? "Grab this frog" : "Claim a spot";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="fixed inset-0 bg-ink/40 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl outline-none"
      >
        <div aria-hidden className={`h-1.5 w-full rounded-t-3xl ${accentBar}`} />
        <div className="p-6">
          <header className="flex items-start justify-between gap-3">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.15em] text-ink-soft">
              <span aria-hidden className="mr-1">{isFrog ? "🐸" : "🎐"}</span>
              {isFrog ? "Frog" : "Shift"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={share}
                className="rounded-full bg-lily px-3 py-1 text-sm font-semibold text-pond-deep transition hover:bg-lily-line"
              >
                {copied ? "Copied ✓" : "🔗 Share"}
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="rounded-full px-2 py-1 text-lg text-ink-soft transition hover:bg-lily"
              >
                ×
              </button>
            </div>
          </header>

          <h2 id={titleId} className="mt-2 font-display text-2xl font-bold leading-tight text-ink">
            {task.title}
          </h2>

          {slot.isFull ? (
            <p className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-reed/10 py-3 text-sm font-bold text-reed-deep">
              <span aria-hidden className="text-base">🐸</span> All set, this one&apos;s covered
            </p>
          ) : (
            <div className="mt-5 rounded-3xl bg-reed/5 p-4">
              <p className="mb-3 text-sm text-ink-soft">
                <span className="font-semibold text-ink">{claimVerb}</span>, no account needed, just add your name.
              </p>
              {task.neededCount >= 2 && (
                <p className="mb-3 text-sm font-semibold text-pond-deep">
                  👥 More fun in a pair, grab it with a friend.
                </p>
              )}
              <ClaimFields taskId={task.id} />
            </div>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-4">
            <Detail label="When" icon="🕒" value={formatWhen(task)} />
            <Detail label="Location" icon="📍" value={task.location} />
            <Detail label="Category" icon="🏷️" value={task.category} />
            <Detail label="Requested group" icon="👥" value={task.requestedGroup} />
            <Detail label="Definition of done" icon="✅" value={task.definitionOfDone} />
            <Detail label="Point of contact" icon="📞" value={task.pointOfContact} />
          </dl>
        </div>
      </div>
    </div>
  );
}
