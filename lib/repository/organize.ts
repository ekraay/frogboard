import { prisma } from "@/lib/db";
import type { EventStatus } from "@prisma/client";

export async function createEvent(name: string, startDate: Date, endDate: Date) {
  return prisma.event.create({ data: { name, startDate, endDate } });
}

export async function listEvents() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { tasks: true } } },
  });
  return events.map((e) => ({
    id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate,
    status: e.status, taskCount: e._count.tasks,
  }));
}

export async function setEventStatus(eventId: string, status: EventStatus) {
  return prisma.event.update({ where: { id: eventId }, data: { status } });
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
