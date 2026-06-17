import type { BoardTask, DayGroup, SlotInfo } from "@/lib/domain/types";

export function getSlotInfo(task: BoardTask): SlotInfo {
  const filled = task.signups.length;
  const needed = task.neededCount;
  return { filled, needed, isFull: filled >= needed };
}

/** Tasks asked of one group (case- and space-insensitive on `requestedGroup`).
 *  A blank group is treated as "no filter" and returns everything. */
export function filterTasksByGroup(tasks: BoardTask[], group: string): BoardTask[] {
  const g = group.trim().toLowerCase();
  if (g === "") return tasks;
  return tasks.filter((t) => (t.requestedGroup ?? "").trim().toLowerCase() === g);
}

/** How many of these tasks are fully staffed, out of the total — the headline a
 *  group organizer reports back ("Scouts — 7 of 9 covered"). */
export function coverageFor(tasks: BoardTask[]): { covered: number; total: number } {
  return { covered: tasks.filter((t) => getSlotInfo(t).isFull).length, total: tasks.length };
}

/**
 * ISO date (YYYY-MM-DD) for a date field stored as UTC midnight.
 * The `date` field represents a pure calendar day — no timezone conversion.
 * Using "UTC" keeps "2026-07-25T00:00:00Z" as "2026-07-25" rather than
 * shifting it to "2026-07-24" in America/Los_Angeles (UTC-7 in summer).
 */
function tzIsoDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

function dayLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: "UTC",
  }).format(d);
}

export function groupTasksByDay(tasks: BoardTask[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const t of tasks) {
    const key = t.date ? tzIsoDate(t.date) : "all-day";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: t.date ? dayLabel(t.date) : "No set date",
        tasks: [],
      });
    }
    groups.get(key)!.tasks.push(t);
  }

  for (const g of groups.values()) {
    g.tasks.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }

  return [...groups.values()].sort((a, b) => {
    if (a.key === "all-day") return 1;
    if (b.key === "all-day") return -1;
    return a.key < b.key ? -1 : 1;
  });
}
