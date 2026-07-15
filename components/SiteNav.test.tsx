import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { SiteNav } from "@/components/SiteNav";
import type { NavContext } from "@/lib/domain/nav";

const ctx = (over: Partial<NavContext> = {}): NavContext => ({
  org: "BCSF", orgHref: "/", event: "Bon Odori 2026", view: "Sign up",
  persona: "volunteer", groups: [], allGroups: false, boardHref: null, shareUrl: null, ...over,
});

test("shows brand, org, event, and view", () => {
  render(<SiteNav ctx={ctx()} />);
  expect(screen.getByText("Frog Board")).toBeInTheDocument();
  expect(screen.getByText("BCSF")).toBeInTheDocument();
  expect(screen.getByText("Bon Odori 2026")).toBeInTheDocument();
  expect(screen.getByText(/Sign up/)).toBeInTheDocument();
});

test("brand links to org home", () => {
  render(<SiteNav ctx={ctx()} />);
  expect(screen.getByRole("link", { name: /Frog Board/ })).toHaveAttribute("href", "/");
});

test("volunteer sees the Hop to it CTA", () => {
  render(<SiteNav ctx={ctx({ persona: "volunteer" })} />);
  expect(screen.getByRole("link", { name: /hop to it/i })).toHaveAttribute("href", "#board");
});

test("lead sees the group chip and the board link", () => {
  render(<SiteNav ctx={ctx({ persona: "lead", view: "Group lead", groups: ["Scouts"], boardHref: "/bon-odori" })} />);
  expect(screen.getByText("👥 Scouts")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /view public board/i })).toHaveAttribute("href", "/bon-odori");
});

test("organizer without an event offers no roster link", () => {
  render(<SiteNav ctx={ctx({ persona: "organizer", event: null, view: "Organize" })} />);
  expect(screen.queryByRole("link", { name: /roster/i })).not.toBeInTheDocument();
});
