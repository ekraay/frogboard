import { prisma } from "@/lib/db";
import type { BoardTask } from "@/lib/domain/types";

/** Most-recently-created event plus its tasks, mapped to BoardTask. */
export async function getActiveEventBoard(): Promise<
  { id: string; name: string; tasks: BoardTask[] } | null
> {
  const event = await prisma.event.findFirst({
    where: { status: "published" },
    orderBy: { createdAt: "desc" },
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
  return {
    id: event.id,
    name: event.name,
    tasks: event.tasks.map((t) => ({
      id: t.id, kind: t.kind, title: t.title, category: t.category,
      requestedGroup: t.requestedGroup, neededCount: t.neededCount, date: t.date,
      startAt: t.startAt, endAt: t.endAt, dueBy: t.dueBy,
      pointOfContact: t.pointOfContact, location: t.location,
      definitionOfDone: t.definitionOfDone, position: t.position, status: t.status,
      waiting: t.waiting, signups: t.signups,
    })),
  };
}
