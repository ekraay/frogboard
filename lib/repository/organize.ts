import { prisma } from "@/lib/db";
import type { Event, EventStatus, AuditAction, TaskKind, Prisma } from "@prisma/client";
import type { ParsedTaskFields } from "@/lib/domain/gridRow";
import { newClaimToken } from "@/lib/security/tokens";
import { generateUniqueSlug } from "@/lib/repository/events";

export async function createEvent(name: string, startDate: Date, endDate: Date): Promise<Event> {
  const slug = await generateUniqueSlug(name);
  return prisma.event.create({ data: { name, slug, startDate, endDate, orgId: "org_bcsf" } });
}

/** An evergreen board of tasks: no dates, drafted until the organizer publishes it. */
export async function createStandingBoard(name: string): Promise<Event> {
  const slug = await generateUniqueSlug(name);
  return prisma.event.create({ data: { name, slug, standing: true, orgId: "org_bcsf" } });
}

export interface EventListItem {
  id: string; name: string; startDate: Date | null; endDate: Date | null;
  status: EventStatus; taskCount: number;
}

export interface StandingBoardItem {
  id: string; name: string; slug: string | null; status: EventStatus; taskCount: number;
}

/** Evergreen boards, newest first. listEvents excludes standing boards, so the
 *  organizer index lists these separately to keep them reachable. */
export async function listStandingBoards(): Promise<StandingBoardItem[]> {
  const boards = await prisma.event.findMany({
    where: { standing: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { _count: { select: { tasks: true } } },
  });
  return boards.map((b) => ({
    id: b.id, name: b.name, slug: b.slug, status: b.status, taskCount: b._count.tasks,
  }));
}

export async function listEvents(): Promise<EventListItem[]> {
  const events = await prisma.event.findMany({
    where: { standing: false },
    // id tiebreak keeps the order deterministic for same-instant creations
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { _count: { select: { tasks: true } } },
  });
  return events.map((e) => ({
    id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate,
    status: e.status, taskCount: e._count.tasks,
  }));
}

/** False when the event no longer exists (deleted under the organizer). */
export async function setEventStatus(eventId: string, status: EventStatus): Promise<boolean> {
  const result = await prisma.event.updateMany({ where: { id: eventId }, data: { status } });
  return result.count > 0;
}

/** Permanently delete an event and (by cascade) its tasks, signups, and audit. */
export async function deleteEvent(eventId: string): Promise<boolean> {
  const result = await prisma.event.deleteMany({ where: { id: eventId } });
  return result.count > 0;
}

export interface GridTask {
  id: string; kind: "shift" | "errand"; title: string;
  category: string | null; requestedGroup: string | null; neededCount: number;
  date: Date | null; startAt: Date | null; endAt: Date | null; dueBy: Date | null;
  location: string | null; description: string | null;
  definitionOfDone: string | null; pointOfContact: string | null;
  position: number; signupCount: number;
}

export async function getEventGrid(eventId: string): Promise<
  { id: string; name: string; slug: string | null; startDate: Date | null; endDate: Date | null; standing: boolean; status: EventStatus; tasks: GridTask[] } | null
> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      tasks: {
        orderBy: { position: "asc" },
        include: { _count: { select: { signups: true } } },
      },
    },
  });
  if (!event) return null;
  return {
    id: event.id, name: event.name, slug: event.slug, startDate: event.startDate, endDate: event.endDate, standing: event.standing, status: event.status,
    tasks: event.tasks.map((t) => ({
      id: t.id, kind: t.kind, title: t.title, category: t.category,
      requestedGroup: t.requestedGroup, neededCount: t.neededCount,
      date: t.date, startAt: t.startAt, endAt: t.endAt, dueBy: t.dueBy,
      location: t.location, description: t.description,
      definitionOfDone: t.definitionOfDone, pointOfContact: t.pointOfContact,
      position: t.position, signupCount: t._count.signups,
    })),
  };
}

const POSITION_GAP = 1024;

export type UpsertResult =
  | { ok: true; taskId: string }
  | { ok: false; field?: string; error: string };

export async function upsertTaskWithAudit(
  eventId: string,
  taskId: string | null,
  fields: ParsedTaskFields,
  actorName: string | null = null,
): Promise<UpsertResult> {
  return prisma.$transaction(async (tx) => {
    if (taskId === null) {
      // Two concurrent creates can read the same max and tie positions; the
      // next renumberTasks corrects it. Acceptable for a single-organizer org.
      const last = await tx.task.aggregate({ where: { eventId }, _max: { position: true } });
      const position = (last._max.position ?? 0) + POSITION_GAP;
      const task = await tx.task.create({ data: { eventId, position, ...fields } });
      await tx.auditLog.create({
        data: {
          eventId, taskId: task.id, action: "create", actorName,
          details: JSON.parse(JSON.stringify({ after: { ...fields, position } })),
        },
      });
      return { ok: true as const, taskId: task.id };
    }

    // Lock the task row first (same primitive as createSignupWithAudit) so a
    // concurrent volunteer claim can't slip between our signup-count read and
    // the update — otherwise needed could silently drop below signups.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Task" WHERE "id" = ${taskId} FOR UPDATE
    `;
    if (locked.length === 0) {
      return { ok: false as const, error: "That task no longer exists." };
    }

    const before = await tx.task.findUnique({
      where: { id: taskId },
      include: { _count: { select: { signups: true } } },
    });
    if (!before || before.eventId !== eventId) {
      return { ok: false as const, error: "That task no longer exists." };
    }
    if (fields.neededCount < before._count.signups) {
      return {
        ok: false as const, field: "need",
        error: `${before._count.signups} already signed up — needed can't go below that.`,
      };
    }
    await tx.task.update({ where: { id: taskId }, data: { ...fields } });
    await tx.auditLog.create({
      data: {
        eventId, taskId, action: "edit", actorName,
        details: JSON.parse(JSON.stringify({
          before: {
            title: before.title, kind: before.kind, category: before.category,
            requestedGroup: before.requestedGroup, neededCount: before.neededCount,
            date: before.date, startAt: before.startAt, endAt: before.endAt, dueBy: before.dueBy,
            location: before.location, description: before.description,
            definitionOfDone: before.definitionOfDone, pointOfContact: before.pointOfContact,
          },
          after: { ...fields },
        })),
      },
    });
    return { ok: true as const, taskId };
  });
}

export async function deleteTaskWithAudit(taskId: string, actorName: string | null = null): Promise<{ ok: true } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    // Lock so a concurrent claim can't add a signup between our snapshot and
    // the cascade delete (it would vanish unrecorded). Post-lock claims see
    // the task gone and fail cleanly.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Task" WHERE "id" = ${taskId} FOR UPDATE
    `;
    if (locked.length === 0) return { ok: false as const, error: "That task is already gone." };

    const task = await tx.task.findUnique({ where: { id: taskId }, include: { signups: true } });
    if (!task) return { ok: false as const, error: "That task is already gone." };
    await tx.auditLog.create({
      data: {
        eventId: task.eventId, taskId, action: "delete", actorName,
        details: JSON.parse(JSON.stringify({
          task: {
            title: task.title, kind: task.kind, category: task.category,
            requestedGroup: task.requestedGroup, neededCount: task.neededCount,
            date: task.date, startAt: task.startAt, endAt: task.endAt, dueBy: task.dueBy,
            location: task.location, description: task.description,
            definitionOfDone: task.definitionOfDone, pointOfContact: task.pointOfContact,
            position: task.position,
          },
          signups: task.signups.map((s) => ({
            name: s.name, email: s.email, phone: s.phone, group: s.group, minor: s.minor,
            // captured so a revert restores the volunteer's self-edit ownership
            claimToken: s.claimToken,
          })),
        })),
      },
    });
    await tx.task.delete({ where: { id: taskId } });
    return { ok: true as const };
  });
}

/**
 * Bulk-delete the listed tasks, scoped to one event so a stray id from another
 * event can't be swept up. Signups cascade away; past audit rows survive
 * (AuditLog.taskId is SetNull). Mirrors deleteEvent's un-audited bulk style —
 * this is a "start over" cleanup, not a tracked single edit. Returns the count
 * actually removed.
 */
export async function deleteTasks(eventId: string, taskIds: string[]): Promise<number> {
  if (taskIds.length === 0) return 0;
  const result = await prisma.task.deleteMany({ where: { eventId, id: { in: taskIds } } });
  return result.count;
}

export interface HistoryEntry {
  id: string;
  action: AuditAction;
  actorName: string | null;
  details: Prisma.JsonValue;
  createdAt: Date;
}

/** Audit trail for one event, newest first. Rows survive their task's deletion. */
export async function getEventHistory(eventId: string): Promise<HistoryEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { eventId },
    // id tiebreak keeps order deterministic for same-instant rows
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, action: true, actorName: true, details: true, createdAt: true },
  });
  return rows;
}

// Audit snapshots survive JSON, so dates arrive as ISO strings. Prisma accepts
// ISO strings for DateTime fields, so we feed them straight back.
interface TaskSnapshot {
  title: string; kind: TaskKind; category: string | null; requestedGroup: string | null;
  neededCount: number; date: string | null; startAt: string | null; endAt: string | null;
  dueBy: string | null; location: string | null; description: string | null;
  definitionOfDone: string | null; pointOfContact: string | null;
}
interface SignupSnapshot {
  name: string; email: string | null; phone: string | null;
  group: string | null; minor: boolean | null; claimToken?: string;
}

/** The editable scalar fields, lifted from a snapshot. Position is reassigned, never restored. */
function taskScalarsFrom(s: TaskSnapshot) {
  return {
    title: s.title, kind: s.kind, category: s.category, requestedGroup: s.requestedGroup,
    neededCount: s.neededCount, date: s.date, startAt: s.startAt, endAt: s.endAt, dueBy: s.dueBy,
    location: s.location, description: s.description,
    definitionOfDone: s.definitionOfDone, pointOfContact: s.pointOfContact,
  };
}

/**
 * Undo one audit entry, recording the undo as a fresh audit row (history stays
 * append-only). Reverts delete (recreate the task and its signups, tokens and
 * all) and edit (restore the prior field values). Other actions aren't revertible yet.
 */
export async function revertAuditEntry(
  auditId: string,
  actorName: string | null = null,
): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.auditLog.findUnique({ where: { id: auditId } });
    if (!entry) return { ok: false as const, error: "That change is no longer here." };

    if (entry.action === "delete") {
      const d = entry.details as unknown as { task: TaskSnapshot; signups: SignupSnapshot[] };
      const last = await tx.task.aggregate({ where: { eventId: entry.eventId }, _max: { position: true } });
      const position = (last._max.position ?? 0) + POSITION_GAP;
      const scalars = taskScalarsFrom(d.task);
      const task = await tx.task.create({ data: { eventId: entry.eventId, position, ...scalars } });
      if (Array.isArray(d.signups) && d.signups.length > 0) {
        await tx.signup.createMany({
          data: d.signups.map((s) => ({
            taskId: task.id, name: s.name, email: s.email, phone: s.phone,
            group: s.group, minor: s.minor, claimToken: s.claimToken ?? newClaimToken(),
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          eventId: entry.eventId, taskId: task.id, action: "create", actorName,
          details: JSON.parse(JSON.stringify({ after: { ...scalars, position }, revertedFrom: auditId })),
        },
      });
      return { ok: true as const, taskId: task.id };
    }

    if (entry.action === "edit") {
      if (!entry.taskId) return { ok: false as const, error: "That task is gone." };
      const current = await tx.task.findUnique({ where: { id: entry.taskId } });
      if (!current) return { ok: false as const, error: "That task is gone." };
      const d = entry.details as unknown as { before: TaskSnapshot };
      const scalars = taskScalarsFrom(d.before);
      await tx.task.update({ where: { id: entry.taskId }, data: { ...scalars } });
      await tx.auditLog.create({
        data: {
          eventId: entry.eventId, taskId: entry.taskId, action: "edit", actorName,
          details: JSON.parse(JSON.stringify({
            before: {
              title: current.title, kind: current.kind, category: current.category,
              requestedGroup: current.requestedGroup, neededCount: current.neededCount,
              date: current.date, startAt: current.startAt, endAt: current.endAt, dueBy: current.dueBy,
              location: current.location, description: current.description,
              definitionOfDone: current.definitionOfDone, pointOfContact: current.pointOfContact,
            },
            after: scalars, revertedFrom: auditId,
          })),
        },
      });
      return { ok: true as const, taskId: entry.taskId };
    }

    return { ok: false as const, error: "That kind of change can't be reverted yet." };
  });
}

export async function renumberTasks(
  eventId: string,
  orderedIds: string[],
  actorName: string | null = null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const tasks = await tx.task.findMany({ where: { eventId }, select: { id: true, position: true } });
    const known = new Map(tasks.map((t) => [t.id, t.position]));
    if (orderedIds.length !== tasks.length || orderedIds.some((id) => !known.has(id))) {
      return { ok: false as const, error: "The order didn't match this event's tasks — refresh and retry." };
    }
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const position = (i + 1) * POSITION_GAP;
      if (known.get(id) !== position) {
        await tx.task.update({ where: { id }, data: { position } });
        await tx.auditLog.create({
          data: { eventId, taskId: id, action: "move", actorName, details: { from: known.get(id), to: position } },
        });
      }
    }
    return { ok: true as const };
  });
}
