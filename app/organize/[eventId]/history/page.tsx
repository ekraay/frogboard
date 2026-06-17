import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { getEventGrid, getEventHistory } from "@/lib/repository/organize";
import { EventHistory } from "@/components/organize/EventHistory";

export const dynamic = "force-dynamic";

export default async function EventHistoryPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) redirect("/organize");
  const { eventId } = await params;
  const event = await getEventGrid(eventId);
  if (!event) redirect("/organize");
  const entries = await getEventHistory(eventId);

  return <EventHistory eventName={event.name} eventId={eventId} entries={entries} />;
}
