import { notFound, redirect } from "next/navigation";
import { getEventParam } from "@/lib/repository/events";

export const dynamic = "force-dynamic";

// Back-compat: old /e/<id> links redirect to the canonical pretty URL (/slug).
export default async function LegacyEventBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const { eventId } = await params;
  const param = await getEventParam(eventId);
  if (!param) notFound();
  const raw = (await searchParams).group;
  const group = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  redirect(`/${param}${group ? `?group=${encodeURIComponent(group)}` : ""}`);
}
