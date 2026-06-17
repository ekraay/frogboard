import { prisma } from "@/lib/db";
import type { Event, EventStatus } from "@prisma/client";
import type { ParsedTaskFields } from "@/lib/domain/gridRow";

export async function createEvent(name: string, startDate: Date, endDate: Date): Promise<Event> {
  return prisma.event.create({ data: { name, startDate, endDate } });
}

export interface EventListItem {
  id: string; name: string; startDate: Date; endDate: Date;
  status: EventStatus; taskCount: number;
}

export async function listEvents(): Promise<EventListItem[]> {
  const events = await prisma.event.findMany({
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
  id: string; kind: "shift" | "frog"; title: string;
  category: string | null; requestedGroup: string | null; neededCount: number;
  date: Date | null; startAt: Date | null; endAt: Date | null; dueBy: Date | null;
  location: string | null; description: string | null;
  definitionOfDone: string | null; pointOfContact: string | null;
  position: number; signupCount: number;
}

export async function getEventGrid(eventId: string): Promise<
  { id: string; name: string; startDate: Date; endDate: Date; status: EventStatus; tasks: GridTask[] } | null
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
    id: event.id, name: event.name, startDate: event.startDate, endDate: event.endDate, status: event.status,
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
