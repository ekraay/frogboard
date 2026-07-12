import { NextRequest, NextResponse } from "next/server";
import { SESSION_MAX_AGE } from "@/lib/security/session";

// Preview opt-in for the dark-launched task board. The organizer visits
// /b/<slug>/preview?on=1 once to set a session cookie the page reads, then lands
// back on the board. ?on=0 clears it. The page render only reads this cookie;
// writing it must happen here in a Route Handler.
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const on = request.nextUrl.searchParams.get("on") !== "0";
  const res = NextResponse.redirect(new URL(`/b/${slug}`, request.url));
  if (on) {
    res.cookies.set("ff_task_board", "1", { path: "/", maxAge: SESSION_MAX_AGE, sameSite: "lax" });
  } else {
    res.cookies.delete("ff_task_board");
  }
  return res;
}
