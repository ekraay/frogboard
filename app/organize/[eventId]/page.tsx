import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { getEventGrid } from "@/lib/repository/organize";
import { getGroupRollups } from "@/lib/repository/directory";
import { getEventLeads } from "@/lib/repository/leads";
import { OrganizeGrid } from "@/components/organize/OrganizeGrid";
import { GroupRollups } from "@/components/organize/GroupRollups";
import { LeadsPanel } from "@/components/organize/LeadsPanel";
import { flagEnabled } from "@/lib/flags";
import { SiteNav } from "@/components/SiteNav";
import type { NavContext } from "@/lib/domain/nav";

export const dynamic = "force-dynamic";

export default async function OrganizeEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) redirect("/organize");
  const { eventId } = await params;
  const grid = await getEventGrid(eventId);
  if (!grid) redirect("/organize");

  const [rollups, leads] = await Promise.all([
    getGroupRollups(grid.id),
    getEventLeads(grid.id),
  ]);
  const groups = rollups.map((r) => r.group);

  const boardParam = grid.slug ?? grid.id;
  const host = (await headers()).get("host") ?? "";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const showNav = flagEnabled("nav", { cookies: jar });
  const navCtx: NavContext = {
    org: "BCSF", orgHref: "/", event: grid.name, view: "Organize",
    persona: "organizer", groups: [], allGroups: false,
    boardHref: `/${boardParam}`, shareUrl: `${proto}://${host}/${boardParam}`,
  };

  return (
    <>
      {showNav && <SiteNav ctx={navCtx} />}
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <div className="mb-4">
        <Link href="/organize"
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-pond underline-offset-2 hover:underline">
          ← All events
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <h1 className="font-display text-2xl font-extrabold text-ink">🐸 {grid.name}</h1>
          <Link href={`/organize/${grid.id}/history`} className="text-sm font-medium text-pond underline-offset-2 hover:underline">
            History
          </Link>
        </div>
      </div>
      <div id="roster" className="mb-4 space-y-4">
        <GroupRollups groups={rollups} />
        <LeadsPanel eventId={grid.id} groups={groups} leads={leads} />
      </div>
      <div id="settings">
        <OrganizeGrid
          event={{ id: grid.id, name: grid.name, status: grid.status, slug: grid.slug, startDate: grid.startDate, endDate: grid.endDate, standing: grid.standing }}
          initialTasks={grid.tasks}
        />
      </div>
      </main>
    </>
  );
}
