// Maps raw grid cell strings ⇄ repository task fields. Pure; shared by the
// client grid (instant validation) and the server action (authoritative).
import { parseDateCell, parseNeedCell, parseTimeCell, type EventCtx } from "@/lib/domain/cells";
import { combineWhen } from "@/lib/domain/when";
import { EVENT_TZ, formatTime } from "@/lib/domain/time";

export interface RawCells {
  title: string;
  /** "shift" | "quick"; anything else normalizes to "shift" in parseRow. */
  kind: string;
  date: string; need: string; time: string;
  category: string; group: string; location: string;
  description: string; definitionOfDone: string; pointOfContact: string;
}

export function emptyCells(): RawCells {
  return {
    title: "", kind: "shift", date: "", need: "", time: "",
    category: "", group: "", location: "",
    description: "", definitionOfDone: "", pointOfContact: "",
  };
}

export interface ParsedTaskFields {
  title: string; kind: "shift" | "quick";
  category: string | null; requestedGroup: string | null; neededCount: number;
  date: Date | null; startAt: Date | null; endAt: Date | null; dueBy: Date | null;
  location: string | null; description: string | null;
  definitionOfDone: string | null; pointOfContact: string | null;
}

export type RowResult =
  | { ok: true; value: ParsedTaskFields }
  | { ok: false; field: keyof RawCells; error: string };

const nullIfBlank = (s: string) => (s.trim() === "" ? null : s.trim());

function tooLong(s: string, max: number): boolean {
  return s.trim().length > max;
}

export function parseRow(cells: RawCells, ctx: EventCtx): RowResult {
  const title = cells.title.trim();
  if (title === "") return { ok: false, field: "title", error: "Every task needs a title." };
  if (tooLong(cells.title, 200)) return { ok: false, field: "title", error: "Title is too long (200 max)." };
  if (tooLong(cells.description, 5000)) return { ok: false, field: "description", error: "Description is too long (5000 max)." };
  if (tooLong(cells.definitionOfDone, 5000)) return { ok: false, field: "definitionOfDone", error: "Definition of done is too long (5000 max)." };
  if (tooLong(cells.category, 200)) return { ok: false, field: "category", error: "Category is too long (200 max)." };
  if (tooLong(cells.group, 200)) return { ok: false, field: "group", error: "Group is too long (200 max)." };
  if (tooLong(cells.location, 200)) return { ok: false, field: "location", error: "Location is too long (200 max)." };
  if (tooLong(cells.pointOfContact, 200)) return { ok: false, field: "pointOfContact", error: "Point of contact is too long (200 max)." };
  const kind = cells.kind === "quick" ? "quick" : "shift";

  const need = parseNeedCell(cells.need);
  if (!need.ok) return { ok: false, field: "need", error: need.error };

  const date = parseDateCell(cells.date, ctx);
  if (!date.ok) return { ok: false, field: "date", error: date.error };

  const time = parseTimeCell(cells.time);
  if (!time.ok) return { ok: false, field: "time", error: time.error };

  const when = combineWhen(kind, date.value, time.value, ctx);
  if (!when.ok) return { ok: false, field: when.field, error: when.error };

  return {
    ok: true,
    value: {
      title, kind, neededCount: need.value,
      category: nullIfBlank(cells.category), requestedGroup: nullIfBlank(cells.group),
      location: nullIfBlank(cells.location), description: nullIfBlank(cells.description),
      definitionOfDone: nullIfBlank(cells.definitionOfDone), pointOfContact: nullIfBlank(cells.pointOfContact),
      ...when.value,
    },
  };
}

function monthDayUtc(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}
function monthDayPacific(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: EVENT_TZ }).format(d);
}

export interface StoredTaskShape {
  title: string; kind: "shift" | "quick"; category: string | null; requestedGroup: string | null;
  neededCount: number; date: Date | null; startAt: Date | null; endAt: Date | null; dueBy: Date | null;
  location: string | null; description: string | null; definitionOfDone: string | null; pointOfContact: string | null;
}

export function taskToCells(t: StoredTaskShape): RawCells {
  let time = "";
  if (t.kind === "quick" && t.dueBy) time = `by ${monthDayPacific(t.dueBy)} ${formatTime(t.dueBy)}`;
  else if (t.startAt && t.endAt) time = `${formatTime(t.startAt)}–${formatTime(t.endAt)}`;
  else if (t.startAt) time = formatTime(t.startAt);
  return {
    title: t.title, kind: t.kind,
    date: t.date ? monthDayUtc(t.date) : "",
    need: String(t.neededCount), time,
    category: t.category ?? "", group: t.requestedGroup ?? "", location: t.location ?? "",
    description: t.description ?? "", definitionOfDone: t.definitionOfDone ?? "",
    pointOfContact: t.pointOfContact ?? "",
  };
}
