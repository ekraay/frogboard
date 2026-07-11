"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { createLead, removeLead, regenerateLeadToken } from "@/lib/repository/leads";
import { importPeople } from "@/lib/repository/directory";
import { parsePersonRows } from "@/lib/domain/roster";

type Err = { ok: false; error: string };

async function requireOrganizer(): Promise<{ ok: true } | Err> {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) return { ok: false, error: "Please sign in." };
  return { ok: true };
}

export async function createLeadAction(
  eventId: string, group: string, name: string,
): Promise<{ ok: true; token: string } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  if (!group.trim()) return { ok: false, error: "Pick a group." };
  if (!name.trim()) return { ok: false, error: "Give the lead a name." };
  const lead = await createLead(eventId, group.trim(), name.trim());
  revalidatePath(`/organize/${eventId}`);
  return { ok: true, token: lead.token };
}

export async function removeLeadAction(id: string, eventId: string): Promise<{ ok: true } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  if (!(await removeLead(id, eventId))) return { ok: false, error: "That lead is already gone." };
  revalidatePath(`/organize/${eventId}`);
  return { ok: true };
}

export async function regenerateLeadTokenAction(
  id: string, eventId: string,
): Promise<{ ok: true; token: string } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const lead = await regenerateLeadToken(id, eventId);
  if (!lead) return { ok: false, error: "That lead is already gone." };
  revalidatePath(`/organize/${eventId}`);
  return { ok: true, token: lead.token };
}

export async function importRosterAction(
  eventId: string, group: string, raw: string, isYouth: boolean,
): Promise<{ ok: true; created: number; updated: number } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  if (!group.trim()) return { ok: false, error: "Name the group first." };
  const { prisma } = await import("@/lib/db");
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { orgId: true } });
  if (!event) return { ok: false, error: "That event no longer exists." };
  const people = parsePersonRows(raw);
  if (people.length === 0) return { ok: false, error: "No people found in that paste." };
  const res = await importPeople(event.orgId, group.trim(), people, { minor: isYouth });
  revalidatePath(`/organize/${eventId}`);
  return { ok: true, ...res };
}
