import { prisma } from "@/lib/db";
import type { Task, Signup } from "@prisma/client";
import type { BoardTask } from "@/lib/domain/types";
import { boardDisplayName } from "@/lib/domain/displayName";

type TaskWithSignups = Task & {
  signups: Pick<Signup, "id" | "name" | "group" | "minor">[];
};

function toBoardTasks(tasks: TaskWithSignups[]): BoardTask[] {
  return tasks.map((t) => ({
    id: t.id, kind: t.kind, title: t.title, category: t.category,
    requestedGroup: t.requestedGroup, neededCount: t.neededCount, date: t.date,
    startAt: t.startAt, endAt: t.endAt, dueBy: t.dueBy,
    pointOfContact: t.pointOfContact, location: t.location,
    definitionOfDone: t.definitionOfDone, position: t.position, status: t.status,
    waiting: t.waiting,
    signups: t.signups.map((s) => ({
      id: s.id, name: boardDisplayName(s.name, s.minor), group: s.group,
    })),
  }));
}

/** One published event's board, or null if it doesn't exist or isn't published. */
export async function getEventBoard(eventId: string): Promise<
  { id: string; name: string; tasks: BoardTask[] } | null
> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, status: "published" },
    include: {
      tasks: {
        orderBy: { position: "asc" },
        include: {
          signups: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, group: true, minor: true },
          },
        },
      },
    },
  });
  if (!event) return null;
  return { id: event.id, name: event.name, tasks: toBoardTasks(event.tasks) };
}

export interface PublishedEventSummary {
  id: string; name: string; startDate: Date; endDate: Date;
  covered: number; total: number;
}

/** Published events, newest first, each with its coverage (full tasks / total). */
export async function listPublishedEvents(): Promise<PublishedEventSummary[]> {
  const events = await prisma.event.findMany({
    where: { status: "published" },
    // id tiebreak keeps the order deterministic for same-instant creations
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { tasks: { select: { neededCount: true, _count: { select: { signups: true } } } } },
  });
  return events.map((e) => ({
    id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate,
    total: e.tasks.length,
    covered: e.tasks.filter((t) => t._count.signups >= t.neededCount).length,
  }));
}
