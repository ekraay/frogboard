"use client";

import { getSlotInfo } from "@/lib/domain/board";
import { formatWhen } from "@/lib/domain/time";
import type { BoardTask } from "@/lib/domain/types";

/** The claim CTA wording: pairs read as a team, then per kind. */
function ctaLabel(task: BoardTask): string {
  if (task.neededCount >= 2) return "👥 Grab with a friend";
  return task.kind === "quick" ? "🐸 Grab a frog" : "🎐 Claim a spot";
}

// A single task as a card. The whole card opens the detail panel; the CTA is a
// visual cue inside it, so there is one accessible control per card and no
// nested buttons. Availability drives the accent: reed once covered, lantern
// while it still needs people.
export function BoardCard({ task, onOpen }: { task: BoardTask; onOpen: (id: string) => void }) {
  const slot = getSlotInfo(task);
  const isFrog = task.kind === "quick";
  const accentText = slot.isFull ? "text-reed-deep" : "text-lantern-deep";
  const accentBg = slot.isFull ? "bg-reed/15" : "bg-lantern/15";
  const barFill = slot.isFull ? "bg-reed" : "bg-lantern";
  const pct = slot.needed > 0 ? Math.min(100, Math.round((slot.filled / slot.needed) * 100)) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task.id);
        }
      }}
      className="group cursor-pointer rounded-[1.5rem] border border-lily-line bg-white p-5 text-left shadow-[0_14px_36px_-20px_rgba(10,74,69,0.55)] outline-none transition duration-300 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-pond"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-[0.7rem] font-bold uppercase tracking-[0.15em] text-ink-soft">
            <span aria-hidden className="mr-1">{isFrog ? "🐸" : "🎐"}</span>
            {isFrog ? "Frog" : "Shift"}
          </p>
          <p className="font-display text-xl font-bold leading-tight text-ink">{task.title}</p>
          <p className="mt-0.5 text-sm font-semibold text-pond">{formatWhen(task)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${accentBg} ${accentText}`}>
          {slot.isFull ? "Covered" : `${slot.filled} of ${slot.needed}`}
        </span>
      </header>

      <ul className="mt-3 grid list-none gap-1 text-sm text-ink-soft">
        {task.category && <li>🏷️ {task.category}</li>}
        {task.location && <li>📍 {task.location}</li>}
      </ul>

      {/* Coverage bar: fill tracks filled/needed in the availability accent. */}
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-lily">
        <div className={`h-full rounded-full ${barFill}`} style={{ width: `${pct}%` }} />
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        {task.signups.length === 0 ? (
          <span className="text-sm text-ink-soft">No one yet</span>
        ) : (
          task.signups.map((s) => (
            <span key={s.id} className="rounded-full bg-lily px-2.5 py-1 text-xs font-semibold text-ink">
              {s.name}
            </span>
          ))
        )}
        {task.requestedGroup && (
          <span className="ml-auto rounded-full bg-pond/10 px-2.5 py-1 text-xs font-semibold text-pond-deep">
            👥 {task.requestedGroup}
          </span>
        )}
      </footer>

      {!slot.isFull && (
        <p className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-reed py-3 text-base font-bold text-white">
          {ctaLabel(task)}
        </p>
      )}
    </div>
  );
}
