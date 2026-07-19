import { NextRequest, NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { getEventSignups } from "@/lib/repository/organize";
import { signupCsvRows, toCsv } from "@/lib/domain/signupCsv";

/** Organizer-only CSV download of every signup for the event. */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ eventId: string }> },
) {
  if (!isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.redirect(new URL("/organize", request.url));
  }
  const { eventId } = await ctx.params;
  const data = await getEventSignups(eventId);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const csv = "\uFEFF" + toCsv(signupCsvRows(data.signups));
  const base = (data.event.slug ?? eventId).replace(/[^a-zA-Z0-9_-]/g, "");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-signups.csv"`,
    },
  });
}
