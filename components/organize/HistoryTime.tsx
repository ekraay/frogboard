"use client";

import { useSyncExternalStore } from "react";

/** Format an ISO instant for the history list. Omit timeZone for the viewer's own. */
export function formatHistoryTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone,
  }).format(new Date(iso));
}

// Server and first client render report false (matching SSR); React then
// re-renders on the client with true. The documented way to read a
// client-only value without a hydration mismatch.
const subscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/** Renders UTC during SSR/hydration, then the viewer's own timezone on the client. */
export function HistoryTime({ iso }: { iso: string }) {
  const isClient = useIsClient();
  return <time dateTime={iso}>{formatHistoryTime(iso, isClient ? undefined : "UTC")}</time>;
}
