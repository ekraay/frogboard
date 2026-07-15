// Pure navigation logic: what the bar shows and which moves it offers. No I/O.
// The breadcrumb roots at the org and treats a group as a removable lens, so it
// stays reversible against the Groups epic's many-to-many model.

export type Persona = "volunteer" | "lead" | "organizer";

export interface NavContext {
  org: string;
  orgHref: string;
  event: string | null;
  view: string;
  persona: Persona;
  groups: string[];
  allGroups: boolean;
  boardHref: string | null;
  shareUrl: string | null;
}

export interface Crumb {
  label: string;
  href: string | null;
}

export interface Segments {
  brand: string;
  brandHref: string;
  crumbs: Crumb[];
  view: string;
  chip: string | null;
}

export interface NavAction {
  key: string;
  label: string;
  href: string | null;
  variant: "cta" | "link" | "share" | "tagline";
}

/** A group is a lens: one shows its name, many show a count, org-wide shows all. */
export function groupChip(groups: string[], allGroups: boolean): string | null {
  if (allGroups) return "All groups";
  if (groups.length === 0) return null;
  if (groups.length === 1) return `👥 ${groups[0]}`;
  return `👥 ${groups.length} groups`;
}

export function breadcrumbSegments(ctx: NavContext): Segments {
  const crumbs: Crumb[] = [{ label: ctx.org, href: ctx.orgHref }];
  if (ctx.event) crumbs.push({ label: ctx.event, href: null });
  return {
    brand: "Frog Board",
    brandHref: ctx.orgHref,
    crumbs,
    view: ctx.view,
    chip: groupChip(ctx.groups, ctx.allGroups),
  };
}

/** Only in-reach moves: an action appears only when its prerequisite exists. */
export function navActions(ctx: NavContext): NavAction[] {
  if (ctx.persona === "volunteer") {
    // Quiet by design: no moves, just the tagline. "Hop to it" is a slogan,
    // not a button; the board itself carries the claim action.
    return [{ key: "hop", label: "Hop to it", href: null, variant: "tagline" }];
  }
  if (ctx.persona === "lead") {
    return ctx.boardHref
      ? [{ key: "board", label: "View public board", href: ctx.boardHref, variant: "link" }]
      : [];
  }
  const acts: NavAction[] = [];
  if (ctx.boardHref) acts.push({ key: "board", label: "Board", href: ctx.boardHref, variant: "link" });
  if (ctx.event) {
    acts.push({ key: "roster", label: "Roster", href: "#roster", variant: "link" });
    acts.push({ key: "settings", label: "Settings", href: "#settings", variant: "link" });
  }
  if (ctx.shareUrl) acts.push({ key: "share", label: "🔗 Share", href: null, variant: "share" });
  return acts;
}
