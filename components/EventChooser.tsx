import Link from "next/link";

export interface ChooserEvent {
  id: string; name: string; startDate: Date; endDate: Date;
  covered: number; total: number;
}

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function dateRange(start: Date, end: Date): string {
  const a = day.format(start);
  const b = day.format(end);
  return a === b ? a : `${a} – ${b}`;
}

/** The public home when more than one event is published: pick one to view. */
export function EventChooser({ events }: { events: ChooserEvent[] }) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-7">
      <header className="mb-9 text-center">
        <div className="garland lantern-glow" aria-hidden>
          <span className="lantern" /><span className="lantern" /><span className="lantern" />
          <span className="lantern" /><span className="lantern" />
        </div>
        <h1 className="font-display text-3xl font-extrabold text-ink">🐸 Choose your event</h1>
        <p className="mt-2 text-ink-soft">A few are running. Tap the one you&rsquo;re here for.</p>
      </header>

      <ul className="space-y-3">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/e/${e.id}`}
              className="pad-rise flex items-baseline justify-between gap-4 rounded-2xl border border-lily-line bg-white px-5 py-4 shadow-sm transition hover:border-reed hover:shadow-md">
              <span>
                <span className="font-display text-xl font-bold text-ink">{e.name}</span>
                <span className="mt-0.5 block text-sm text-ink-soft">{dateRange(e.startDate, e.endDate)}</span>
              </span>
              <span className="shrink-0 rounded-full bg-lily px-3 py-1 text-sm font-bold text-pond-deep">
                {e.covered} of {e.total} covered
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
