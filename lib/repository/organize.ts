import { prisma } from "@/lib/db";
import type { Event, EventStatus } from "@prisma/client";

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
