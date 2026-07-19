import { EVENT_TZ, formatTime } from "@/lib/domain/time";
import type { TaskKind } from "@/lib/domain/types";

export interface SignupExportRecord {
  taskTitle: string;
  taskKind: TaskKind;
  taskDate: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  category: string | null;
  position: number;
  name: string;
  email: string | null;
  phone: string | null;
  group: string | null;
  minor: boolean | null;
  createdAt: Date;
}

const HEADER = ["Task", "Kind", "Date", "Time", "Category", "Name", "Email", "Phone", "Group", "Minor", "Signed up"];

// Task.date is a stored calendar day: format in UTC, as the board does.
const DAY_UTC = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
// createdAt is an instant: render its local (event-timezone) wall-clock day.
const DAY_LOCAL = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: EVENT_TZ });

const KIND_LABEL = { shift: "Shift", errand: "Task" } as const;

/** Volunteer-typed text opened in spreadsheets: neutralize leading formula triggers. */
function guard(v: string): string {
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}

function timeRange(startAt: Date | null, endAt: Date | null): string {
  return startAt && endAt ? `${formatTime(startAt)}–${formatTime(endAt)}` : "";
}

function byTaskThenSignup(a: SignupExportRecord, b: SignupExportRecord): number {
  // When both sides are null the subtraction yields NaN, which is falsy, so the
  // comparison falls through to the next tier. That is the intended null-vs-null
  // behavior, not an accident.
  const date = (a.taskDate?.getTime() ?? Infinity) - (b.taskDate?.getTime() ?? Infinity);
  if (date) return date;
  const start = (a.startAt?.getTime() ?? Infinity) - (b.startAt?.getTime() ?? Infinity);
  if (start) return start;
  return a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime();
}

export function signupCsvRows(records: SignupExportRecord[]): string[][] {
  const rows = [...records].sort(byTaskThenSignup).map((r) => [
    r.taskTitle,
    KIND_LABEL[r.taskKind],
    r.taskDate ? DAY_UTC.format(r.taskDate) : "",
    timeRange(r.startAt, r.endAt),
    r.category ?? "",
    guard(r.name),
    guard(r.email ?? ""),
    guard(r.phone ?? ""),
    guard(r.group ?? ""),
    r.minor ? "Yes" : "",
    `${DAY_LOCAL.format(r.createdAt)} ${formatTime(r.createdAt)}`,
  ]);
  return [HEADER, ...rows];
}

function cell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
