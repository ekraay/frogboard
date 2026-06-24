import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { getEventGrid } from "@/lib/repository/organize";
import { OrganizeGrid } from "@/components/organize/OrganizeGrid";
import { SlugEditor } from "@/components/organize/SlugEditor";

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

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-extrabold text-ink">🐸 {grid.name}</h1>
        <div className="flex items-baseline gap-4">
          <Link href={`/${grid.slug ?? grid.id}`} target="_blank" rel="noopener noreferrer"
            className="text-sm font-medium text-reed-deep underline-offset-2 hover:underline">
            View signup page ↗
          </Link>
          <Link href={`/organize/${grid.id}/history`} className="text-sm font-medium text-pond underline-offset-2 hover:underline">
            History
          </Link>
          <Link href="/organize" className="text-sm font-medium text-pond underline-offset-2 hover:underline">
            ← All events
          </Link>
        </div>
      </div>
      <div className="mb-4">
        <SlugEditor eventId={grid.id} slug={grid.slug} />
      </div>
      <OrganizeGrid
        event={{ id: grid.id, name: grid.name, status: grid.status, startDate: grid.startDate, endDate: grid.endDate }}
        initialTasks={grid.tasks}
      />
    </main>
  );
}
