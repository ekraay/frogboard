import type { BoardTask } from "@/lib/domain/types";
import { fieldEq, tzIsoDate } from "@/lib/domain/board";

export interface BoardFilters {
  keyword: string;   // "" means no keyword
  group: string[];   // requestedGroup values (OR within)
  category: string[];
  location: string[];
  date: string[];    // ISO calendar days (YYYY-MM-DD)
  dueSoon: boolean;  // "most urgent" signal
  bigGap: boolean;   // "biggest gap" signal
}

export function emptyFilters(): BoardFilters {
  return { keyword: "", group: [], category: [], location: [], date: [], dueSoon: false, bigGap: false };
}

export function hasAnyFilter(f: BoardFilters): boolean {
  return (
    f.keyword.trim() !== "" || f.group.length > 0 || f.category.length > 0 ||
    f.location.length > 0 || f.date.length > 0 || f.dueSoon || f.bigGap
  );
}

/** The urgency date: a frog's deadline, else its calendar day, else none. */
export function effectiveWhen(task: BoardTask): Date | null {
  return task.dueBy ?? task.date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the task's deadline-or-day is on or before the calendar day three
 *  days after `now`. Compared on UTC calendar-day strings, so the window is a
 *  whole-day count and overdue tasks (any earlier day) count as due soon. */
export function isDueSoon(task: BoardTask, now: Date): boolean {
  const when = effectiveWhen(task);
  if (!when) return false;
  const cutoff = tzIsoDate(new Date(now.getTime() + 3 * DAY_MS));
  return tzIsoDate(when) <= cutoff;
}

/** True when the task still needs two or more people. */
export function hasBigGap(task: BoardTask): boolean {
  return task.neededCount - task.signups.length >= 2;
}

/** Order tasks by the largest unfilled gap first, then lower position. Pure
 *  (returns a new array). Used to float the biggest needs up when the Biggest
 *  gap filter is on. */
export function sortByGap(tasks: BoardTask[]): BoardTask[] {
  const gap = (t: BoardTask) => t.neededCount - t.signups.length;
  return [...tasks].sort((a, b) => gap(b) - gap(a) || a.position - b.position);
}

/** AND across sections, OR within a multi-select section. `now` is passed in. */
export function applyBoardFilters(tasks: BoardTask[], f: BoardFilters, now: Date): BoardTask[] {
  const kw = f.keyword.trim().toLowerCase();
  return tasks.filter((t) => {
    if (kw && !t.title.toLowerCase().includes(kw)) return false;
    if (f.group.length && !f.group.some((g) => fieldEq(t.requestedGroup, g))) return false;
    if (f.category.length && !f.category.some((c) => fieldEq(t.category, c))) return false;
    if (f.location.length && !f.location.some((l) => fieldEq(t.location, l))) return false;
    if (f.date.length && !(t.date && f.date.includes(tzIsoDate(t.date)))) return false;
    if (f.dueSoon && !isDueSoon(t, now)) return false;
    if (f.bigGap && !hasBigGap(t)) return false;
    return true;
  });
}
