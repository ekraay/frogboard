import type { BoardTask, DayGroup, SlotInfo } from "@/lib/domain/types";

export function getSlotInfo(task: BoardTask): SlotInfo {
  const filled = task.signups.length;
  const needed = task.neededCount;
  return { filled, needed, isFull: filled >= needed };
}

/** Split tasks into those still needing people and those already full, built on
 *  the same fill rule as `getSlotInfo` so "full" means one thing board-wide.
 *  Order within each bucket follows the incoming (position-sorted) order. */
export function partitionByAvailability(tasks: BoardTask[]): { available: BoardTask[]; claimed: BoardTask[] } {
  const available: BoardTask[] = [];
  const claimed: BoardTask[] = [];
  for (const t of tasks) (getSlotInfo(t).isFull ? claimed : available).push(t);
  return { available, claimed };
}

export interface Facets { date?: string; group?: string; category?: string; location?: string }
export interface FacetOptions {
  date: { value: string; label: string }[];
  group: string[]; category: string[]; location: string[];
}

function fieldEq(actual: string | null, wanted: string): boolean {
  return (actual ?? "").trim().toLowerCase() === wanted.trim().toLowerCase();
}

/** Tasks matching every provided facet (AND). A blank/absent facet adds no constraint. */
export function filterTasks(tasks: BoardTask[], facets: Facets): BoardTask[] {
  return tasks.filter((t) => {
    if (facets.group?.trim() && !fieldEq(t.requestedGroup, facets.group)) return false;
    if (facets.category?.trim() && !fieldEq(t.category, facets.category)) return false;
    if (facets.location?.trim() && !fieldEq(t.location, facets.location)) return false;
    if (facets.date?.trim() && (!t.date || tzIsoDate(t.date) !== facets.date.trim())) return false;
    return true;
  });
}

/** Distinct, non-empty values present in the tasks, for building the filter bar. */
export function facetOptions(tasks: BoardTask[]): FacetOptions {
  const dates = new Map<string, string>(); // iso -> weekday label
  const group = new Set<string>(), category = new Set<string>(), location = new Set<string>();
  for (const t of tasks) {
    if (t.date) dates.set(tzIsoDate(t.date), dayLabel(t.date));
    if (t.requestedGroup?.trim()) group.add(t.requestedGroup.trim());
    if (t.category?.trim()) category.add(t.category.trim());
    if (t.location?.trim()) location.add(t.location.trim());
  }
  const alpha = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return {
    date: [...dates.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([value, label]) => ({ value, label })),
    group: alpha(group), category: alpha(category), location: alpha(location),
  };
}

/** Tasks asked of one group (case- and space-insensitive on `requestedGroup`).
 *  A blank group is treated as "no filter" and returns everything. */
export function filterTasksByGroup(tasks: BoardTask[], group: string): BoardTask[] {
  return filterTasks(tasks, { group });
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
