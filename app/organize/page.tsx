import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { listEvents, listStandingBoards } from "@/lib/repository/organize";
import { signOutAction } from "@/app/actions/organize";
import { SignInForm } from "@/components/organize/SignInForm";
import { NewEventForm } from "@/components/organize/NewEventForm";
import { NewOngoingBoardForm } from "@/components/organize/NewOngoingBoardForm";
import { EventList } from "@/components/organize/EventList";
import { StandingBoardList } from "@/components/organize/StandingBoardList";
import { SiteNav } from "@/components/SiteNav";
import type { NavContext } from "@/lib/domain/nav";

export const dynamic = "force-dynamic";

export default async function OrganizePage() {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) {
    return <main className="px-4"><SignInForm /></main>;
  }
  const [events, standingBoards] = await Promise.all([listEvents(), listStandingBoards()]);
  const navCtx: NavContext = {
    org: "BCSF", orgHref: "/", event: null, view: "Organize",
    persona: "organizer", groups: [], allGroups: false, boardHref: null, shareUrl: null,
  };
  return (
    <>
      <SiteNav ctx={navCtx} />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-extrabold text-ink">🐸 Your events</h1>
        <form action={signOutAction}>
          <button type="submit" className="text-sm font-medium text-pond underline-offset-2 hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <EventList events={events} />
      <StandingBoardList boards={standingBoards} />
      <NewEventForm />
      <NewOngoingBoardForm />
      </main>
    </>
  );
}
