import Link from "next/link";
import { breadcrumbSegments, navActions, type NavContext } from "@/lib/domain/nav";
import { ShareButton } from "@/components/ShareButton";

// The one bar that answers "where am I". Left cluster is identical everywhere;
// the right cluster carries only the moves in reach for this persona. A server
// component: the page computes the context, this only renders it.
export function SiteNav({ ctx }: { ctx: NavContext }) {
  const seg = breadcrumbSegments(ctx);
  const actions = navActions(ctx);
  // The tagline rides under the brand title, not in the action cluster.
  const tagline = actions.find((a) => a.variant === "tagline");
  const clusterActions = actions.filter((a) => a.variant !== "tagline");

  return (
    <nav
      aria-label="Site"
      className="sticky top-0 z-30 flex items-center gap-3 border-b border-washi-deep bg-washi/90 px-4 py-2.5 backdrop-blur"
    >
      <div className="flex flex-col">
        <Link href={seg.brandHref} className="flex items-center gap-2 font-display text-lg font-extrabold leading-tight text-ink">
          <span aria-hidden className="text-xl">🐸</span>
          <span className="hidden sm:inline">{seg.brand}</span>
        </Link>
        {tagline && <span className="text-xs font-normal italic text-ink-soft">{tagline.label}</span>}
      </div>

      {seg.crumbs.map((c) => (
        <span key={c.label} className="flex items-center gap-3 min-w-0">
          <span aria-hidden className="text-lily-line">/</span>
          {c.href ? (
            <Link href={c.href} className="truncate font-bold text-ink hover:text-pond">{c.label}</Link>
          ) : (
            <span className="truncate font-bold text-ink">{c.label}</span>
          )}
        </span>
      ))}

      <span className="whitespace-nowrap text-sm font-normal italic text-ink-soft/70">· {seg.view}</span>

      <div className="ml-auto flex items-center gap-2">
        {seg.chip && (
          <span className="whitespace-nowrap rounded-full bg-pond/10 px-2.5 py-1 text-xs font-bold text-pond-deep">
            {seg.chip}
          </span>
        )}
        {clusterActions.map((a) => {
          if (a.variant === "share") {
            return ctx.shareUrl ? <ShareButton key={a.key} url={ctx.shareUrl} /> : null;
          }
          const cls =
            a.variant === "cta"
              ? "whitespace-nowrap rounded-lg bg-reed px-3 py-2 text-sm font-bold text-white"
              : "whitespace-nowrap text-sm font-bold text-pond hover:text-pond-deep";
          return (
            <Link key={a.key} href={a.href ?? "#"} className={cls}>{a.label}</Link>
          );
        })}
      </div>
    </nav>
  );
}
