import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    <a href={href}>{children}</a>,
}));

import { EventHistory } from "@/components/organize/EventHistory";

const entry = (over: Partial<Parameters<typeof EventHistory>[0]["entries"][number]>) => ({
  id: "1", action: "create" as const, actorName: "Aya",
  details: { after: { title: "Games" } }, createdAt: new Date("2026-06-17T15:00:00Z"),
  ...over,
});

test("lists each change with what happened and who did it", () => {
  render(<EventHistory eventName="Ginza" eventId="e1" entries={[
    entry({ id: "1", action: "create", actorName: "Aya", details: { after: { title: "Games" } } }),
    entry({ id: "2", action: "delete", actorName: "Kenji", details: { task: { title: "Old" } } }),
  ]} />);
  expect(screen.getByText("Added: Games")).toBeInTheDocument();
  expect(screen.getByText(/Aya/)).toBeInTheDocument();
  expect(screen.getByText("Deleted: Old")).toBeInTheDocument();
  expect(screen.getByText(/Kenji/)).toBeInTheDocument();
});

test("credits an unnamed actor as an organizer", () => {
  render(<EventHistory eventName="Ginza" eventId="e1" entries={[
    entry({ actorName: null }),
  ]} />);
  expect(screen.getByText(/an organizer/i)).toBeInTheDocument();
});

test("shows an empty state when nothing has happened yet", () => {
  render(<EventHistory eventName="Ginza" eventId="e1" entries={[]} />);
  expect(screen.getByText(/no changes yet/i)).toBeInTheDocument();
});

test("links back to the event grid", () => {
  render(<EventHistory eventName="Ginza" eventId="e1" entries={[]} />);
  expect(screen.getByRole("link", { name: /back to the grid/i })).toHaveAttribute("href", "/organize/e1");
});
