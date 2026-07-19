export function DownloadSignupsButton({ eventId }: { eventId: string }) {
  return (
    <a
      href={`/organize/${eventId}/signups.csv`}
      className="inline-flex items-center gap-1.5 rounded-xl border border-lily-line bg-white px-3 py-1.5 text-sm font-bold text-pond transition hover:border-reed hover:text-pond-deep"
    >
      <span aria-hidden>⬇️</span> Download signups
    </a>
  );
}
