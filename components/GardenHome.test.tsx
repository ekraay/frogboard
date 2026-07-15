import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    <a href={href}>{children}</a>,
}));

import { GardenHome, type ChooserEvent, type ChooserBoard } from "@/components/GardenHome";

const ev = (over: Partial<ChooserEvent> = {}): ChooserEvent => ({
  id: "e1", name: "Ginza", slug: null, startDate: new Date("2026-07-24"),
  endDate: new Date("2026-07-26"), covered: 7, total: 9, ...over,
});
const bd = (over: Partial<ChooserBoard> = {}): ChooserBoard => ({
  id: "b1", name: "Temple needs", slug: "temple-needs", taskCount: 3, ...over,
});

test("links each gathering to its pretty slug, falling back to the id", () => {
  render(<GardenHome events={[
    ev({ id: "e1", name: "Ginza Bazaar", slug: "ginza-2026" }),
    ev({ id: "e2", name: "Bon Odori", slug: null }),
  ]} boards={[]} />);
  expect(screen.getByRole("link", { name: /ginza bazaar/i })).toHaveAttribute("href", "/ginza-2026");
  expect(screen.getByRole("link", { name: /bon odori/i })).toHaveAttribute("href", "/e2");
});

test("shows coverage for each gathering", () => {
  render(<GardenHome events={[ev({ name: "Ginza Bazaar", covered: 7, total: 9 })]} boards={[]} />);
  expect(screen.getByText(/7 of 9 covered/i)).toBeInTheDocument();
});

test("lists ongoing boards with their task counts, linked by slug", () => {
  render(<GardenHome events={[]} boards={[bd({ name: "Temple needs", slug: "temple-needs", taskCount: 3 })]} />);
  expect(screen.getByRole("link", { name: /temple needs/i })).toHaveAttribute("href", "/temple-needs");
  expect(screen.getByText(/3 tasks/i)).toBeInTheDocument();
});

test("singularises a one-task board", () => {
  render(<GardenHome events={[]} boards={[bd({ taskCount: 1 })]} />);
  expect(screen.getByText(/^1 task$/i)).toBeInTheDocument();
});

test("shows the Ongoing boards section only when boards exist", () => {
  render(<GardenHome events={[ev()]} boards={[]} />);
  expect(screen.queryByText(/ongoing boards/i)).not.toBeInTheDocument();
});
