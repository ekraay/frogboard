import type { Metadata } from "next";
import { getLeadRosterView } from "@/lib/repository/leads";
import { RosterView } from "@/components/RosterView";
import { SiteNav } from "@/components/SiteNav";
import type { NavContext } from "@/lib/domain/nav";

// Live signups; always fresh. Keep the token out of search engines and Referer headers.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function LeadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getLeadRosterView(token);
  if (!view) {
    return (
      <main className="mx-auto max-w-md px-4 pt-16 text-center">
        <h1 className="font-display text-xl font-extrabold text-ink">This link isn&apos;t valid 🐸</h1>
        <p className="mt-2 text-ink-soft">Ask your organizer for a fresh one.</p>
      </main>
    );
  }
  const navCtx: NavContext = {
    org: "BCSF", orgHref: "/", event: view.eventName, view: "Group lead",
    persona: "lead", groups: [view.group], allGroups: false,
    boardHref: `/${view.boardParam}`, shareUrl: null,
  };
  return (
    <>
      <SiteNav ctx={navCtx} />
      <RosterView token={token} group={view.group} eventName={view.eventName} counts={view.counts} byPatrol={view.byPatrol} roster={view.roster} />
    </>
  );
}
