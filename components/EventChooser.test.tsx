import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    <a href={href}>{children}</a>,
}));

import { EventChooser } from "@/components/EventChooser";

const ev = (over: Partial<Parameters<typeof EventChooser>[0]["events"][number]>) => ({
  id: "e1", name: "Ginza", slug: null as string | null, startDate: new Date("2026-07-24"),
  endDate: new Date("2026-07-26"), covered: 7, total: 9, ...over,
});

test("links each event to its pretty slug, falling back to the id", () => {
  render(<EventChooser events={[
    ev({ id: "e1", name: "Ginza Bazaar", slug: "ginza-2026", covered: 7, total: 9 }),
    ev({ id: "e2", name: "Bon Odori", slug: null, covered: 0, total: 4 }),
  ]} />);
  expect(screen.getByRole("link", { name: /ginza bazaar/i })).toHaveAttribute("href", "/ginza-2026");
  expect(screen.getByRole("link", { name: /bon odori/i })).toHaveAttribute("href", "/e2");
});

test("shows coverage for each event", () => {
  render(<EventChooser events={[ev({ name: "Ginza Bazaar", covered: 7, total: 9 })]} />);
  expect(screen.getByText(/7 of 9 covered/i)).toBeInTheDocument();
});
