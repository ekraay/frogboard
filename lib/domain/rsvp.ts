export type RsvpStatus = "yes" | "no" | "maybe";
export type EffectiveStatus = RsvpStatus | "blank";

export interface RsvpRecord {
  day: Date | null;
  status: RsvpStatus;
  reason?: string | null;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

/** A day-specific answer overrides the whole-event (null) answer; absent is "blank". */
export function effectiveStatus(records: RsvpRecord[], day: Date | null): EffectiveStatus {
  if (day) {
    const dayRow = records.find((r) => r.day && sameDay(r.day, day));
    if (dayRow) return dayRow.status;
  }
  const eventRow = records.find((r) => r.day === null);
  return eventRow ? eventRow.status : "blank";
}

/** Whole-event rollup: yes if coming any day, else maybe, else no, else blank. */
export function eventStatus(records: RsvpRecord[]): EffectiveStatus {
  if (records.some((r) => r.status === "yes")) return "yes";
  if (records.some((r) => r.status === "maybe")) return "maybe";
  if (records.some((r) => r.status === "no")) return "no";
  return "blank";
}
