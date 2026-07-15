import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { listPublishedEvents } from "@/lib/repository/events";
import { EventChooser } from "@/components/EventChooser";
import { flagEnabled } from "@/lib/flags";
import { SiteNav } from "@/components/SiteNav";
import type { NavContext } from "@/lib/domain/nav";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const events = await listPublishedEvents();
  const showNav = flagEnabled("nav", { cookies: await cookies() });
  const navCtx: NavContext = {
    org: "BCSF", orgHref: "/", event: null, view: "Choose event",
    persona: "volunteer", groups: [], allGroups: false, boardHref: null, shareUrl: null,
  };

  if (events.length === 0) {
    return (
      <>
        {showNav && <SiteNav ctx={navCtx} />}
        <main className="mx-auto max-w-2xl px-4 py-16 text-center text-ink-soft">
          <p className="text-4xl" aria-hidden>🐸</p>
          <h1 className="mt-3 font-display text-2xl font-bold text-ink">No event yet</h1>
          <p className="mt-2">
            Run <code className="rounded bg-lily px-1.5 py-0.5 text-ink">npm run db:seed</code> to load one.
          </p>
        </main>
      </>
    );
  }

  // One event: skip the chooser, go straight to its board (carry any ?group=).
  if (events.length === 1) {
    const raw = (await searchParams).group;
    const group = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
    const param = events[0].slug ?? events[0].id;
    redirect(`/${param}${group ? `?group=${encodeURIComponent(group)}` : ""}`);
  }

  return (
    <>
      {showNav && <SiteNav ctx={navCtx} />}
      <EventChooser events={events} />
    </>
  );
}
