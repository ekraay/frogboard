import { redirect } from "next/navigation";
import { listPublishedEvents } from "@/lib/repository/events";
import { EventChooser } from "@/components/EventChooser";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const events = await listPublishedEvents();

  if (events.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center text-ink-soft">
        <p className="text-4xl" aria-hidden>🐸</p>
        <h1 className="mt-3 font-display text-2xl font-bold text-ink">No event yet</h1>
        <p className="mt-2">
          Run <code className="rounded bg-lily px-1.5 py-0.5 text-ink">npm run db:seed</code> to load one.
        </p>
      </main>
    );
  }

  // One event: skip the chooser, go straight to its board (carry any ?group=).
  if (events.length === 1) {
    const raw = (await searchParams).group;
    const group = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
    redirect(`/e/${events[0].id}${group ? `?group=${encodeURIComponent(group)}` : ""}`);
  }

  return <EventChooser events={events} />;
}
