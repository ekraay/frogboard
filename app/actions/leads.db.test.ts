// @vitest-environment node
import { afterAll, beforeEach, expect, test, vi } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));

import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { sessionToken, SESSION_COOKIE } from "@/lib/security/session";
import { createLeadAction, removeLeadAction, regenerateLeadTokenAction, importRosterAction } from "@/app/actions/leads";

const ORG = "org_bcsf";
async function event() {
  return prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
}
function authenticate() { cookieJar.set(SESSION_COOKIE, sessionToken()); }

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
  vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42");
});
afterAll(async () => { await prisma.$disconnect(); });

test("createLeadAction rejects a signed-out caller", async () => {
  const e = await event();
  expect(await createLeadAction(e.id, "Scouts", "Simon")).toEqual({ ok: false, error: "Please sign in." });
});

test("createLeadAction returns a token when signed in", async () => {
  authenticate();
  const e = await event();
  const r = await createLeadAction(e.id, "Scouts", "Simon");
  expect(r.ok).toBe(true);
  expect(await prisma.lead.count({ where: { eventId: e.id } })).toBe(1);
});

test("importRosterAction parses and imports, gated", async () => {
  const e = await event();
  const raw = "First Name\tLast Name\tPatrol\tScout ID\nSimon\tKraay\tHawk\t135291163";
  expect(await importRosterAction(e.id, "Scouts", raw, true)).toEqual({ ok: false, error: "Please sign in." });
  authenticate();
  const r = await importRosterAction(e.id, "Scouts", raw, true);
  expect(r).toEqual({ ok: true, created: 1, updated: 0 });
  expect(await prisma.person.count({ where: { orgId: ORG, group: "Scouts" } })).toBe(1);
});

test("remove and regenerate are gated and effective", async () => {
  authenticate();
  const e = await event();
  const lead = await prisma.lead.create({ data: { eventId: e.id, orgId: ORG, group: "Scouts", name: "S", token: "t" } });
  const rolled = await regenerateLeadTokenAction(lead.id, e.id);
  expect(rolled.ok).toBe(true);
  expect(await removeLeadAction(lead.id, e.id)).toEqual({ ok: true });
});

test("cannot remove or regenerate a lead by naming a different event", async () => {
  authenticate();
  const a = await event();
  const b = await event();
  const lead = await prisma.lead.create({ data: { eventId: a.id, orgId: ORG, group: "Scouts", name: "S", token: "t" } });
  expect(await removeLeadAction(lead.id, b.id)).toEqual({ ok: false, error: "That lead is already gone." });
  expect(await prisma.lead.count({ where: { id: lead.id } })).toBe(1);
  const rolled = await regenerateLeadTokenAction(lead.id, b.id);
  expect(rolled.ok).toBe(false);
  expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.token).toBe("t");
});
