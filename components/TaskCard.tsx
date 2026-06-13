import { getSlotInfo } from "@/lib/domain/board";
import { formatWhen } from "@/lib/domain/time";
import type { BoardTask } from "@/lib/domain/types";
import { ClaimForm } from "@/components/ClaimForm";
import { Claimant } from "@/components/Claimant";

export function TaskCard({ task }: { task: BoardTask }) {
  const slot = getSlotInfo(task);
  const isFrog = task.kind === "frog";

  return (
    <article
      className={`pad-rise relative overflow-hidden rounded-3xl border p-5 transition ${
        slot.isFull
          ? "border-lily-line bg-lily/40 shadow-sm"
          : "border-lily-line bg-white shadow-[0_10px_30px_-18px_rgba(10,79,74,0.45)]"
      }`}
    >
      {/* A sliver of pond at the card's edge — the lily pad floats on water. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1.5 ${isFrog ? "bg-amber" : "bg-pond"}`}
      />

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
            <span aria-hidden className="mr-1">{isFrog ? "🐸" : "🎐"}</span>
            {isFrog ? "Frog" : "Shift"}
          </p>
          <h3 className="font-display text-xl font-bold leading-tight text-ink">
            {task.title}
          </h3>
          <p className="mt-0.5 text-sm font-medium text-pond">{formatWhen(task)}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
            slot.isFull
              ? "bg-reed/15 text-reed-deep"
              : "bg-lantern/15 text-lantern"
          }`}
        >
          {slot.filled} of {slot.needed} filled
        </span>
      </header>

      {/* Icons stay inline in the text node so a category that echoes the title
          doesn't split into a bare matching text node. */}
      <ul className="mt-3 grid list-none gap-1 text-sm text-ink-soft">
        {task.category && <li>🏷️ {task.category}</li>}
        {task.requestedGroup && <li>👥 Requested: {task.requestedGroup}</li>}
        {task.location && <li>📍 {task.location}</li>}
        {task.pointOfContact && <li>📞 {task.pointOfContact}</li>}
        {task.definitionOfDone && <li className="italic">✅ {task.definitionOfDone}</li>}
      </ul>

      {task.signups.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {task.signups.map((s) => (
            <Claimant key={s.id} signupId={s.id} name={s.name} group={s.group} />
          ))}
        </ul>
      )}

      {slot.isFull ? (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-reed/10 py-2.5 text-sm font-bold text-reed-deep">
          <span aria-hidden>🐸</span> All set — this one&apos;s covered
        </p>
      ) : (
        <ClaimForm taskId={task.id} />
      )}
    </article>
  );
}
