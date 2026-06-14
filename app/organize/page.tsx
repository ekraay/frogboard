import { cookies } from "next/headers";
import Link from "next/link";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { listEvents } from "@/lib/repository/organize";
import { signOutAction } from "@/app/actions/organize";
import { SignInForm } from "@/components/organize/SignInForm";
import { NewEventForm } from "@/components/organize/NewEventForm";

export const dynamic = "force-dynamic";

export default async function OrganizePage() {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) {
    return <main className="px-4"><SignInForm /></main>;
  }
  const events = await listEvents();
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-extrabold text-ink">🐸 Your events</h1>
        <form action={signOutAction}>
          <button type="submit" className="text-sm font-medium text-pond underline-offset-2 hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <ul className="mb-8 space-y-3">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/organize/${e.id}`}
              className="flex items-center justify-between rounded-2xl border border-lily-line bg-white p-4 shadow-sm transition hover:border-reed">
              <span className="font-bold text-ink">{e.name}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="text-ink-soft">{e.taskCount} tasks</span>
                {e.status === "published"
                  ? <span className="rounded-full bg-amber/20 px-3 py-1 font-bold text-lantern">🏮 Sign-ups open</span>
                  : <span className="rounded-full bg-lily px-3 py-1 font-bold text-ink-soft">🌱 Draft</span>}
              </span>
            </Link>
          </li>
        ))}
        {events.length === 0 && <li className="text-ink-soft">No events yet — create the first one below.</li>}
      </ul>
      <NewEventForm />
    </main>
  );
}
