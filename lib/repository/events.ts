import { prisma } from "@/lib/db";
import type { Task, Signup } from "@prisma/client";
import type { BoardTask } from "@/lib/domain/types";
import { boardDisplayName } from "@/lib/domain/displayName";
import { slugify, isReservedSlug } from "@/lib/domain/slug";

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

/** A slug derived from `name`, guaranteed free of reserved words and collisions within org_bcsf. */
export async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let n = 1;
  while (
    isReservedSlug(candidate) ||
    (await prisma.event.findUnique({ where: { orgId_slug: { orgId: "org_bcsf", slug: candidate } } }))
  ) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/** Normalize and set an event's slug, or report why it can't be used. */
export async function updateEventSlug(
  eventId: string,
  rawSlug: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  if (rawSlug.trim() === "") return { ok: false, error: "Give the link a name." };
  const slug = slugify(rawSlug);
  if (isReservedSlug(slug)) return { ok: false, error: "That word is reserved — pick another." };
  const clash = await prisma.event.findUnique({ where: { orgId_slug: { orgId: "org_bcsf", slug } } });
  if (clash && clash.id !== eventId) return { ok: false, error: "That link is already taken." };
  const updated = await prisma.event.updateMany({ where: { id: eventId }, data: { slug } });
  if (updated.count === 0) return { ok: false, error: "That event no longer exists." };
  return { ok: true, slug };
}

/** The canonical URL param (slug if set, else id) for a published event, or null. */
export async function getEventParam(eventId: string): Promise<string | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, status: "published" },
    select: { id: true, slug: true },
  });
  if (!event) return null;
  return event.slug ?? event.id;
}

/** One published event's board by slug or id, or null. Scoped to the org so a slug another org reuses never leaks. */
export async function getEventBoardByParam(param: string): Promise<
  { id: string; name: string; tasks: BoardTask[] } | null
> {
  const event = await prisma.event.findFirst({
    where: { orgId: "org_bcsf", status: "published", OR: [{ slug: param }, { id: param }] },
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
  id: string; name: string; slug: string | null; startDate: Date | null; endDate: Date | null;
  covered: number; total: number;
}

/** Published events, newest first, each with its coverage (full tasks / total). */
export async function listPublishedEvents(): Promise<PublishedEventSummary[]> {
  const events = await prisma.event.findMany({
    where: { status: "published", standing: false },
    // id tiebreak keeps the order deterministic for same-instant creations
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { tasks: { select: { neededCount: true, _count: { select: { signups: true } } } } },
  });
  return events.map((e) => ({
    id: e.id, name: e.name, slug: e.slug, startDate: e.startDate, endDate: e.endDate,
    total: e.tasks.length,
    covered: e.tasks.filter((t) => t._count.signups >= t.neededCount).length,
  }));
}
