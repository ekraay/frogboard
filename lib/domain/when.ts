// Combines a calendar day + wall-clock Pacific times into stored UTC instants.
// This is the Phase 2 timezone rule: date and times come from the same row, so
// the board's day header can never disagree with the displayed time.
import { EVENT_TZ } from "@/lib/domain/time";
import { parseDateCell, type DateParts, type EventCtx, type TimeCellValue } from "@/lib/domain/cells";

/** A date-only deadline ("by Saturday") means the end of that day, 11:59 PM. */
const END_OF_DAY_MINUTES = 23 * 60 + 59;

function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  // V8 always emits "00" for midnight; the % 24 guards non-V8 engines that
  // historically emitted "24" with hour12: false.
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export function pacificToUtc(d: DateParts, minutesSinceMidnight: number): Date {
  const naive = Date.UTC(d.year, d.month - 1, d.day) + minutesSinceMidnight * 60_000;
  let guess = new Date(naive - tzOffsetMinutes(new Date(naive)) * 60_000);
  const second = tzOffsetMinutes(guess);
  if (naive - second * 60_000 !== guess.getTime()) guess = new Date(naive - second * 60_000);
  return guess;
}

export function utcMidnight(d: DateParts): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

export interface TaskWhen {
  date: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  dueBy: Date | null;
}
export type WhenResult =
  | { ok: true; value: TaskWhen }
  | { ok: false; field: "date" | "time"; error: string };

export function combineWhen(
  kind: "shift" | "quick",
  date: DateParts | null,
  time: TimeCellValue,
  ctx: EventCtx,
): WhenResult {
  if (kind === "quick") {
    if (time.kind === "range") {
      return { ok: false, field: "time", error: "A quick task takes a deadline, not a time range. Try 'by 5pm' or a due date." };
    }
    if (time.kind === "start") {
      // A bare time ("5pm") is a deadline. The day comes from the row's Date cell.
      if (!date) {
        return { ok: false, field: "time", error: "Add a due date for that time, or type 'by Sat 5pm'." };
      }
      return { ok: true, value: { date: null, startAt: null, endAt: null, dueBy: pacificToUtc(date, time.start) } };
    }
    if (time.kind === "none") {
      // A Date cell with no time is due at the end of that day; no date is an anytime quick task.
      const dueBy = date ? pacificToUtc(date, END_OF_DAY_MINUTES) : null;
      return { ok: true, value: { date: null, startAt: null, endAt: null, dueBy } };
    }
    let day: DateParts | null = date;
    if (time.dateText) {
      const parsed = parseDateCell(time.dateText, ctx);
      if (!parsed.ok || parsed.value === null) {
        return { ok: false, field: "time", error: parsed.ok ? "Missing due date." : parsed.error };
      }
      day = parsed.value;
    }
    if (!day) day = ctx.start;
    const minutes = time.time ?? END_OF_DAY_MINUTES;
    return { ok: true, value: { date: null, startAt: null, endAt: null, dueBy: pacificToUtc(day, minutes) } };
  }

  // shift
  if (time.kind === "dueBy") {
    return { ok: false, field: "time", error: "A shift takes a time range. A 'by ...' deadline is for quick tasks." };
  }
  if (time.kind !== "none" && !date) {
    return { ok: false, field: "date", error: "A timed shift needs a date." };
  }
  const value: TaskWhen = { date: date ? utcMidnight(date) : null, startAt: null, endAt: null, dueBy: null };
  if (date && time.kind === "range") {
    value.startAt = pacificToUtc(date, time.start);
    value.endAt = pacificToUtc(date, time.end);
  } else if (date && time.kind === "start") {
    value.startAt = pacificToUtc(date, time.start);
  }
  return { ok: true, value };
}
