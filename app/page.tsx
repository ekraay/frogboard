import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { listPublishedEvents, listPublishedStandingBoards } from "@/lib/repository/events";
import { GardenHome } from "@/components/GardenHome";
import { flagEnabled } from "@/lib/flags";
import { SiteNav } from "@/components/SiteNav";
import type { NavContext } from "@/lib/domain/nav";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const [events, boards] = await Promise.all([listPublishedEvents(), listPublishedStandingBoards()]);
  const showNav = flagEnabled("nav", { cookies: await cookies() });
  const navCtx: NavContext = {
    org: "BCSF", orgHref: "/", event: null, view: "Choose event",
    persona: "volunteer", groups: [], allGroups: false, boardHref: null, shareUrl: null,
  };

  if (events.length === 0 && boards.length === 0) {
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

  // One destination: skip the landing and go straight there. A lone event
  // carries any ?group= deep-link; a lone standing board takes no group.
  if (events.length + boards.length === 1) {
    if (events.length === 1) {
      const raw = (await searchParams).group;
      const group = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
      const param = events[0].slug ?? events[0].id;
      redirect(`/${param}${group ? `?group=${encodeURIComponent(group)}` : ""}`);
    }
    redirect(`/${boards[0].slug ?? boards[0].id}`);
  }

  return (
    <>
      {showNav && <SiteNav ctx={navCtx} />}
      <GardenHome events={events} boards={boards} />
    </>
  );
}
