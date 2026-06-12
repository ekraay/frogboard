// Pure cell parsers for the organizer grid. Dialects observed in real BCSF /
// community sheets. No I/O, no timezone math here (see when.ts).

export interface DateParts { year: number; month: number; day: number }
export interface EventCtx { year: number; start: DateParts; end: DateParts }
export type CellResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type TimeCellValue =
  | { kind: "none" }
  | { kind: "range"; start: number; end: number } // minutes since midnight, wall clock
  | { kind: "start"; start: number }
  | { kind: "dueBy"; dateText: string | null; time: number | null };

const MONTH_NAMES = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const WEEKDAY_NAMES = ["sun","mon","tue","wed","thu","fri","sat"];

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, "");
  return MONTH_NAMES.findIndex((m) => w.startsWith(m));
}

function weekdayIndex(word: string): number {
  const w = word.toLowerCase().replace(/[.,]$/, "");
  return WEEKDAY_NAMES.findIndex((d) => w.startsWith(d) && w.length >= 3);
}

function weekdayOf(d: DateParts): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

function addDays(d: DateParts, n: number): DateParts {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day) + n * 86_400_000);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

function validDate(d: DateParts): boolean {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day));
  return t.getUTCMonth() + 1 === d.month && t.getUTCDate() === d.day;
}

export function parseDateCell(text: string, ctx: EventCtx): CellResult<DateParts | null> {
  let t = text.trim();
  if (t === "") return { ok: true, value: null };

  // Strip a leading weekday ("Sat", "Saturday,") when more follows.
  const lead = /^([A-Za-z]+),?\s+(.+)$/.exec(t);
  if (lead && weekdayIndex(lead[1]) >= 0) t = lead[2];

  // m/d or m/d/y
  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t);
  if (slash) {
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : ctx.year;
    const d = { year, month: Number(slash[1]), day: Number(slash[2]) };
    return validDate(d) ? { ok: true, value: d } : { ok: false, error: "That date doesn't exist." };
  }

  // Month-name day ("Jul 25", "July 25")
  const monthDay = /^([A-Za-z]+)\.?\s+(\d{1,2})$/.exec(t);
  if (monthDay) {
    const mi = monthIndex(monthDay[1]);
    if (mi >= 0) {
      const d = { year: ctx.year, month: mi + 1, day: Number(monthDay[2]) };
      return validDate(d) ? { ok: true, value: d } : { ok: false, error: "That date doesn't exist." };
    }
  }

  // Weekday alone → first match inside the event window
  const wi = weekdayIndex(t);
  if (wi >= 0 && !/\s/.test(t)) {
    for (let d = ctx.start, i = 0; i < 60; d = addDays(d, 1), i++) {
      if (weekdayOf(d) === wi) return { ok: true, value: d };
      if (d.year === ctx.end.year && d.month === ctx.end.month && d.day === ctx.end.day) break;
    }
    return { ok: false, error: `No ${t} inside this event's dates.` };
  }

  return { ok: false, error: "Try a date like 'Jul 25' or '7/25'." };
}

interface LooseClock { minutes: number; meridiem: "am" | "pm" | null }

function parseClockLoose(text: string): LooseClock | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const mer = m[3] ? (m[3].toLowerCase().startsWith("p") ? "pm" : "am") : null;
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return { minutes: h * 60 + min, meridiem: mer };
}

/** "3:00 PM" → 900; null when unparseable. */
function parseClock(text: string): number | null {
  const c = parseClockLoose(text);
  return c ? c.minutes : null;
}

export function parseTimeCell(text: string): CellResult<TimeCellValue> {
  const t = text.trim();
  if (t === "") return { ok: true, value: { kind: "none" } };

  const by = /^by\s+(.+)$/i.exec(t);
  if (by) {
    const rest = by[1].trim();
    const whole = parseClock(rest);
    if (whole !== null) return { ok: true, value: { kind: "dueBy", dateText: null, time: whole } };
    const words = rest.split(/\s+/);
    for (let i = words.length - 1; i >= 1; i--) {
      const time = parseClock(words.slice(i).join(" "));
      if (time !== null) {
        return { ok: true, value: { kind: "dueBy", dateText: words.slice(0, i).join(" "), time } };
      }
    }
    return { ok: true, value: { kind: "dueBy", dateText: rest, time: null } };
  }

  const range = /^(.+?)\s*[-–—]\s*(.+)$/.exec(t);
  if (range) {
    const a = parseClockLoose(range[1]);
    const b = parseClockLoose(range[2]);
    if (a && b) {
      let start = a.minutes;
      const end = b.minutes;
      // "8-11am": start lacks a meridiem — borrow the end's; if that puts the
      // start at/after the end ("10-1pm"), fall back to the opposite half-day
      // so the shift runs forward (10 AM–1 PM).
      if (a.meridiem === null && b.meridiem !== null) {
        const borrowed = b.meridiem === "pm" && a.minutes < 720 ? a.minutes + 720 : a.minutes;
        start = borrowed < end ? borrowed : a.minutes;
      }
      if (start >= end) return { ok: false, error: "End time must be after start." };
      return { ok: true, value: { kind: "range", start, end } };
    }
  }

  const single = parseClock(t);
  if (single !== null) return { ok: true, value: { kind: "start", start: single } };

  return { ok: false, error: "Try a time like '10:00 AM–1:00 PM' or 'by Sat 10am'." };
}

export function parseNeedCell(text: string): CellResult<number> {
  const t = text.trim();
  if (t === "") return { ok: true, value: 1 };
  if (!/^\d+$/.test(t)) return { ok: false, error: "Needed is a whole number." };
  const n = Number(t);
  if (n < 1 || n > 999) return { ok: false, error: "Needed must be between 1 and 999." };
  return { ok: true, value: n };
}
