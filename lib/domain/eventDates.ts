// Forgiving parser for the two event-window date fields. Unlike the grid's
// parseDateCell (which resolves dates *within* an event), this stands alone —
// an event defines its own window, so it needs explicit years and no
// weekday-in-window logic. Pure; no Date.now (the reference year is passed in).
import { utcMidnight } from "@/lib/domain/when";
import type { DateParts } from "@/lib/domain/cells";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function validDate(d: DateParts): boolean {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day));
  return (
    t.getUTCFullYear() === d.year &&
    t.getUTCMonth() + 1 === d.month &&
    t.getUTCDate() === d.day
  );
}

const NO_DATE = "That date doesn't exist.";
const TRY = "Try a date like 9/25/2026 or Sep 25, 2026.";

type One = { ok: true; value: DateParts } | { ok: false; error: string };

function parseOne(text: string, defaultYear: number): One {
  const t = text.trim();
  if (t === "") return { ok: false, error: "Add a date — like 9/25/2026." };

  const isoM = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (isoM) {
    const d = { year: +isoM[1], month: +isoM[2], day: +isoM[3] };
    return validDate(d) ? { ok: true, value: d } : { ok: false, error: NO_DATE };
  }

  const slashM = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t);
  if (slashM) {
    if (slashM[3] && slashM[3].length === 2) {
      return { ok: false, error: "Use a four-digit year, like 2026." };
    }
    const d = { year: slashM[3] ? +slashM[3] : defaultYear, month: +slashM[1], day: +slashM[2] };
    return validDate(d) ? { ok: true, value: d } : { ok: false, error: NO_DATE };
  }

  const namedM = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(t);
  if (namedM) {
    const mi = MONTHS.findIndex((m) => namedM[1].toLowerCase().startsWith(m));
    if (mi >= 0) {
      const d = { year: namedM[3] ? +namedM[3] : defaultYear, month: mi + 1, day: +namedM[2] };
      return validDate(d) ? { ok: true, value: d } : { ok: false, error: NO_DATE };
    }
  }

  return { ok: false, error: TRY };
}

export type EventDatesResult =
  | { ok: true; startDate: Date; endDate: Date }
  | { ok: false; field: "startDate" | "endDate"; error: string };

export function parseEventDates(
  startText: string,
  endText: string,
  defaultYear: number,
): EventDatesResult {
  const start = parseOne(startText, defaultYear);
  if (!start.ok) return { ok: false, field: "startDate", error: start.error };
  // The end day inherits the start's year when the organizer doesn't retype it.
  const end = parseOne(endText, start.value.year);
  if (!end.ok) return { ok: false, field: "endDate", error: end.error };

  const startDate = utcMidnight(start.value);
  const endDate = utcMidnight(end.value);
  if (endDate < startDate) {
    return { ok: false, field: "endDate", error: "The last day can't be before the first." };
  }
  return { ok: true, startDate, endDate };
}
