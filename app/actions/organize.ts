"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  passwordMatches, sessionToken, isValidSession,
  SESSION_COOKIE, NAME_COOKIE, SESSION_MAX_AGE,
} from "@/lib/security/session";
import {
  createEvent, setEventStatus, deleteEvent,
  upsertTaskWithAudit, deleteTaskWithAudit, deleteTasks, renumberTasks, revertAuditEntry,
} from "@/lib/repository/organize";
import { prisma } from "@/lib/db";
import { parseRow, type RawCells } from "@/lib/domain/gridRow";
import { parseEventDates } from "@/lib/domain/eventDates";
import type { DateParts, EventCtx } from "@/lib/domain/cells";

type Ok = { ok: true };
type Err = { ok: false; error: string; field?: string };

async function requireOrganizer(): Promise<Ok | Err> {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) return { ok: false, error: "Please sign in." };
  return { ok: true };
}

/** The signed-in organizer's display name, or null. Stamped onto audit rows. */
async function organizerName(): Promise<string | null> {
  const name = (await cookies()).get(NAME_COOKIE)?.value?.trim();
  return name ? name : null;
}

export async function signIn(formData: FormData): Promise<Ok | Err> {
  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password)) return { ok: false, error: "That password doesn't match." };
  const jar = await cookies();
  const cookieOpts = {
    httpOnly: true, sameSite: "lax" as const, path: "/",
    maxAge: SESSION_MAX_AGE, secure: process.env.NODE_ENV === "production",
  };
  jar.set(SESSION_COOKIE, sessionToken(), cookieOpts);
  const name = String(formData.get("name") ?? "").trim();
  if (name) jar.set(NAME_COOKIE, name, cookieOpts);
  return { ok: true };
}

export async function signOut(): Promise<Ok> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(NAME_COOKIE);
  return { ok: true };
}

/** Form-action wrapper for sign-out (returns void for form action compatibility). */
export async function signOutAction(): Promise<void> {
  await signOut();
}

export async function createEventAction(
  formData: FormData,
): Promise<{ ok: true; eventId: string } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the event a name." };
  const dates = parseEventDates(
    String(formData.get("startDate") ?? ""),
    String(formData.get("endDate") ?? ""),
    new Date().getUTCFullYear(),
  );
  if (!dates.ok) return { ok: false, error: dates.error, field: dates.field };
  const event = await createEvent(name, dates.startDate, dates.endDate);
  revalidatePath("/organize");
  return { ok: true, eventId: event.id };
}

export async function setEventStatusAction(
  eventId: string,
  status: "draft" | "published" | "archived",
): Promise<Ok | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  // setEventStatus returns false when the event no longer exists
  const changed = await setEventStatus(eventId, status);
  if (!changed) return { ok: false, error: "That event no longer exists." };
  revalidatePath("/");
  revalidatePath("/organize");
  return { ok: true };
}

export async function deleteEventAction(eventId: string): Promise<Ok | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const deleted = await deleteEvent(eventId);
  if (!deleted) return { ok: false, error: "That event no longer exists." };
  revalidatePath("/");
  revalidatePath("/organize");
  return { ok: true };
}

function toParts(d: Date): DateParts {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

async function eventCtx(eventId: string): Promise<EventCtx | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  return { year: event.startDate.getUTCFullYear(), start: toParts(event.startDate), end: toParts(event.endDate) };
}

export interface SaveTaskInput { eventId: string; taskId: string | null; cells: RawCells }
export type SaveTaskResult = { ok: true; taskId: string } | Err;

export async function saveTask(input: SaveTaskInput): Promise<SaveTaskResult> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const ctx = await eventCtx(input.eventId);
  if (!ctx) return { ok: false, error: "That event no longer exists." };
  const parsed = parseRow(input.cells, ctx);
  if (!parsed.ok) return { ok: false, error: parsed.error, field: parsed.field };
  const result = await upsertTaskWithAudit(input.eventId, input.taskId, parsed.value, await organizerName());
  if (!result.ok) return { ok: false, error: result.error, field: result.field };
  revalidatePath("/");
  return { ok: true, taskId: result.taskId };
}

export async function deleteTask(taskId: string): Promise<Ok | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const result = await deleteTaskWithAudit(taskId, await organizerName());
  if (!result.ok) return result;
  revalidatePath("/");
  return { ok: true };
}

/** "Start over": bulk-remove the listed tasks for an event. Scoped server-side
 *  so a stray id can't reach another event. Returns how many were cleared. */
export async function clearTasks(
  eventId: string,
  taskIds: string[],
): Promise<{ ok: true; count: number } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const count = await deleteTasks(eventId, taskIds);
  revalidatePath("/");
  return { ok: true, count };
}

/** Undo one logged change from the history view. Records the undo, stamped to the organizer. */
export async function revertChange(auditId: string): Promise<Ok | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const result = await revertAuditEntry(auditId, await organizerName());
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/");
  return { ok: true };
}

export async function reorderTasks(eventId: string, orderedIds: string[]): Promise<Ok | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const result = await renumberTasks(eventId, orderedIds, await organizerName());
  if (!result.ok) return result;
  revalidatePath("/");
  return { ok: true };
}
