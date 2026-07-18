// @vitest-environment node
import { afterAll, beforeEach, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";

process.env.ORGANIZER_PASSWORD ??= "test-password";
const { GET } = await import("@/app/organize/[eventId]/signups.csv/route");
const { sessionToken, SESSION_COOKIE } = await import("@/lib/security/session");

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

function request(eventId: string, cookie?: string): [NextRequest, { params: Promise<{ eventId: string }> }] {
  const req = new NextRequest(`http://localhost/organize/${eventId}/signups.csv`, {
    headers: cookie ? { cookie } : {},
  });
  return [req, { params: Promise.resolve({ eventId }) }];
}

test("redirects to /organize without a valid session", async () => {
  const res = await GET(...request("whatever"));
  expect(res.status).toBeGreaterThanOrEqual(300);
  expect(res.status).toBeLessThan(400);
  expect(res.headers.get("location")).toBe("http://localhost/organize");
});

test("404s on an unknown event with a valid session", async () => {
  const res = await GET(...request("nope", `${SESSION_COOKIE}=${sessionToken()}`));
  expect(res.status).toBe(404);
});

test("streams the CSV with BOM, headers, and a data row", async () => {
  const event = await prisma.event.create({
    data: { name: "Obon", slug: "obon-2026", orgId: "org_bcsf", startDate: new Date(), endDate: new Date() },
  });
  const task = await prisma.task.create({ data: { eventId: event.id, title: "Games booth" } });
  await prisma.signup.create({
    data: { taskId: task.id, name: "Kenji", phone: "555-0100", claimToken: "t1" },
  });

  const res = await GET(...request(event.id, `${SESSION_COOKIE}=${sessionToken()}`));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(res.headers.get("content-disposition")).toBe('attachment; filename="obon-2026-signups.csv"');
  // Response.text() always strips a leading UTF-8 BOM (WHATWG Fetch's "UTF-8
  // decode" step), regardless of TextDecoder's ignoreBOM. Decode the raw
  // bytes ourselves to confirm the BOM the client actually receives.
  const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
  expect(body.charCodeAt(0)).toBe(0xfeff);
  expect(body).toContain("Task,Kind,Date,Time,Category,Name,Email,Phone,Group,Minor,Signed up");
  expect(body).toContain("Kenji");
  expect(body).toContain("555-0100");
});
