import type { BoardTask } from "@/lib/domain/types";

/** Fixed event timezone for Phase 1 (BCSF). Per-event timezone is a later enhancement. */
export const EVENT_TZ = "America/Los_Angeles";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TZ,
  }).format(d).replace(/ | /g, " ");
}

function monthDay(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: EVENT_TZ,
  }).formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${month} ${day}`;
}

export function formatWhen(task: BoardTask): string {
  if (task.kind === "errand") {
    return task.dueBy ? `By ${monthDay(task.dueBy)}` : "Anytime";
  }
  if (task.startAt && task.endAt) {
    return `${formatTime(task.startAt)}–${formatTime(task.endAt)}`;
  }
  if (task.startAt) return `From ${formatTime(task.startAt)}`;
  return "All day";
}

export { MONTHS };
