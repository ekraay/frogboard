import { getSlotInfo } from "@/lib/domain/board";
import { formatWhen } from "@/lib/domain/time";
import type { BoardTask } from "@/lib/domain/types";
import { ClaimForm } from "@/components/ClaimForm";
import { Claimant } from "@/components/Claimant";

export function TaskCard({ task, index = 0, isOrganizer = false }: { task: BoardTask; index?: number; isOrganizer?: boolean }) {
  const slot = getSlotInfo(task);
  const isFrog = task.kind === "quick";
  // Board-wide cascade as the pads surface, capped so the last one isn't slow.
  const delay = `${Math.min(index * 70, 480)}ms`;

  return (
    <article
      className="pad-rise group"
      style={{ animationDelay: delay }}
    >
      <div
        className={`relative overflow-hidden rounded-[1.75rem] border p-5 transition duration-300 ease-out group-hover:-translate-y-1 ${
          slot.isFull
            ? "border-lily-line/70 bg-lily/50 shadow-[0_6px_20px_-16px_rgba(10,74,69,0.5)]"
            : "border-lily-line bg-white shadow-[0_14px_36px_-20px_rgba(10,74,69,0.55)] group-hover:shadow-[0_22px_44px_-20px_rgba(10,74,69,0.6)]"
        }`}
      >
        {/* A sliver of pond at the card's edge — the lily pad floats on water. */}
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1.5 ${
            isFrog
              ? "bg-gradient-to-b from-amber to-lantern"
              : "bg-gradient-to-b from-pond to-pond-deep"
          }`}
        />
        {/* faint light pooling in the top-left, like lantern-light on water */}
        <span
          aria-hidden
          className="pointer-events-none absolute -left-8 -top-10 h-28 w-28 rounded-full bg-amber/10 blur-2xl"
        />

        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-0.5 text-[0.7rem] font-bold uppercase tracking-[0.15em] text-ink-soft">
              <span aria-hidden className="mr-1">{isFrog ? "🐸" : "🎐"}</span>
              {isFrog ? "Frog" : "Shift"}
            </p>
            <h3 className="font-display text-xl font-bold leading-tight text-ink">
              {task.title}
            </h3>
            <p className="mt-0.5 text-sm font-semibold text-pond">{formatWhen(task)}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
              slot.isFull
                ? "bg-reed/15 text-reed-deep"
                : "bg-lantern/15 text-lantern-deep"
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
              <Claimant key={s.id} signupId={s.id} name={s.name} group={s.group} isOrganizer={isOrganizer} />
            ))}
          </ul>
        )}

        {slot.isFull ? (
          <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-reed/10 py-2.5 text-sm font-bold text-reed-deep">
            <span aria-hidden className="text-base">🐸</span> All set — this one&apos;s covered
          </p>
        ) : (
          <ClaimForm taskId={task.id} />
        )}
      </div>
    </article>
  );
}
