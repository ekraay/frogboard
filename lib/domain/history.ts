import type { AuditAction } from "@prisma/client";

/** A single audit row, narrowed to what the history view needs. */
export interface AuditEntryView {
  action: AuditAction;
  details: unknown;
}

type Details = Record<string, unknown>;

function titleOf(d: Details): string | null {
  const after = d.after as Details | undefined;
  const task = d.task as Details | undefined;
  const before = d.before as Details | undefined;
  const title = after?.title ?? task?.title ?? before?.title;
  return typeof title === "string" ? title : null;
}

/** One plain line describing an audit row for the history view. */
export function summarizeAuditEntry(entry: AuditEntryView): string {
  const d = (entry.details ?? {}) as Details;
  const title = titleOf(d);
  const summary = typeof d.summary === "string" ? d.summary : null;
  switch (entry.action) {
    case "create": return title ? `Added: ${title}` : "Added a task";
    case "edit": return title ? `Edited: ${title}` : "Edited a task";
    case "delete": return title ? `Deleted: ${title}` : "Deleted a task";
    case "move": return "Reordered a task";
    case "claim": return summary ?? "Signed up";
    case "release": return summary ?? "Sign-up removed";
    case "flag": return "Flagged a task";
  }
}
