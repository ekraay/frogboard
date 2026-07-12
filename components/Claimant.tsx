"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseSignup, organizerReleaseSignup } from "@/app/actions/signups";
import { getClaimToken, forgetClaim } from "@/lib/client/ownership";

// Cross-tab ownership changes arrive via the storage event.
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function Claimant({
  signupId,
  name,
  group,
  isOrganizer = false,
}: {
  signupId: string;
  name: string;
  group: string | null;
  isOrganizer?: boolean;
}) {
  // Read device-local ownership without a hydration mismatch: the server (and
  // first paint) sees null; after mount the client snapshot reveals ownership.
  const token = useSyncExternalStore(
    subscribe,
    () => getClaimToken(signupId),
    () => null,
  );
  const owned = token !== null;
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onRemove() {
    startTransition(async () => {
      const result = owned
        ? await releaseSignup(signupId, token)
        : await organizerReleaseSignup(signupId);
      if (result.ok) {
        if (owned) forgetClaim(signupId);
        router.refresh();
      }
    });
  }

  return (
    <li
      className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-2 text-sm transition ${
        owned
          ? "border-reed/40 bg-reed/10 text-ink"
          : "border-lily-line bg-lily text-ink"
      }`}
    >
      <span aria-hidden className="text-[0.95em] leading-none">🐸</span>
      <span className="font-medium">{name}</span>
      {group && <span className="text-ink-soft">· {group}</span>}
      {(owned || isOrganizer) && (
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          aria-label={`Remove ${name}`}
          className="ml-0.5 grid h-5 w-5 place-items-center rounded-full text-reed-deep transition hover:bg-reed/20 disabled:opacity-50"
        >
          ×
        </button>
      )}
    </li>
  );
}
