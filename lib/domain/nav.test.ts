import { describe, expect, test } from "vitest";
import { breadcrumbSegments, groupChip, navActions, type NavContext } from "@/lib/domain/nav";

const base: NavContext = {
  org: "BCSF", orgHref: "/", event: null, view: "Organize",
  persona: "organizer", groups: [], allGroups: false, boardHref: null, shareUrl: null,
};

describe("groupChip", () => {
  test("no groups → no chip", () => expect(groupChip([], false)).toBeNull());
  test("one group → a lens chip", () => expect(groupChip(["Scouts"], false)).toBe("👥 Scouts"));
  test("many groups → a count chip", () => expect(groupChip(["Scouts", "Taiko", "YAO"], false)).toBe("👥 3 groups"));
  test("all groups → an all-groups note", () => expect(groupChip([], true)).toBe("All groups"));
});

describe("breadcrumbSegments", () => {
  test("org home: brand, one crumb, no event", () => {
    const s = breadcrumbSegments({ ...base, event: null });
    expect(s.brand).toBe("Frog Board");
    expect(s.crumbs).toEqual([{ label: "BCSF", href: "/" }]);
  });
  test("event surface: org crumb links, event crumb is current", () => {
    const s = breadcrumbSegments({ ...base, event: "Bon Odori 2026" });
    expect(s.crumbs).toEqual([{ label: "BCSF", href: "/" }, { label: "Bon Odori 2026", href: null }]);
  });
  test("carries the view label and the chip", () => {
    const s = breadcrumbSegments({ ...base, view: "Sign up", groups: ["Scouts"] });
    expect(s.view).toBe("Sign up");
    expect(s.chip).toBe("👥 Scouts");
  });
});

describe("navActions", () => {
  test("volunteer: a help link and one Hop to it CTA", () => {
    const a = navActions({ ...base, persona: "volunteer" });
    expect(a.map((x) => x.key)).toEqual(["help", "hop"]);
    expect(a.find((x) => x.key === "hop")?.variant).toBe("cta");
  });
  test("lead with a board link: one View public board link", () => {
    const a = navActions({ ...base, persona: "lead", boardHref: "/bon-odori" });
    expect(a).toEqual([{ key: "board", label: "View public board", href: "/bon-odori", variant: "link" }]);
  });
  test("lead without a board link: no dead affordance", () => {
    expect(navActions({ ...base, persona: "lead", boardHref: null })).toEqual([]);
  });
  test("organizer on an event: board, roster, settings, share", () => {
    const a = navActions({ ...base, persona: "organizer", event: "Bon Odori 2026", boardHref: "/bon-odori", shareUrl: "https://x/bon-odori" });
    expect(a.map((x) => x.key)).toEqual(["board", "roster", "settings", "share"]);
  });
  test("organizer index (no event): roster and settings are not offered", () => {
    const a = navActions({ ...base, persona: "organizer", event: null, boardHref: null, shareUrl: null });
    expect(a.map((x) => x.key)).toEqual([]);
  });
});
