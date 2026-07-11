import type { Metadata } from "next";
import { getLeadChaseView } from "@/lib/repository/leads";
import { ChaseView } from "@/components/ChaseView";

// Live signups; always fresh. Keep the token out of search engines and Referer headers.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function LeadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getLeadChaseView(token);
  if (!view) {
    return (
      <main className="mx-auto max-w-md px-4 pt-16 text-center">
        <h1 className="font-display text-xl font-extrabold text-ink">This link isn&apos;t valid 🐸</h1>
        <p className="mt-2 text-ink-soft">Ask your organizer for a fresh one.</p>
      </main>
    );
  }
  return (
    <ChaseView token={token} group={view.group} eventName={view.eventName} counts={view.counts} chase={view.chase} />
  );
}
