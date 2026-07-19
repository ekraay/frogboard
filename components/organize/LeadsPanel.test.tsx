import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LeadsPanel } from "@/components/organize/LeadsPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/leads", () => ({
  createLeadAction: vi.fn(), removeLeadAction: vi.fn(),
  regenerateLeadTokenAction: vi.fn(), importRosterAction: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) =>
    <a href={href} {...rest}>{children}</a>,
}));

test("lists leads with copy/regenerate/remove", () => {
  render(<LeadsPanel eventId="e1" groups={["Scouts"]}
    leads={[{ id: "l1", group: "Scouts", name: "Simon", token: "tok" }]} />);
  expect(screen.getByText(/Simon/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
});

test("offers an import affordance and an assign form", () => {
  render(<LeadsPanel eventId="e1" groups={["Scouts"]} leads={[]} />);
  expect(screen.getByRole("button", { name: /import roster/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /assign lead/i })).toBeInTheDocument();
});

test("links to the group's RSVP list", () => {
  render(<LeadsPanel eventId="e1" groups={["Scouts"]}
    leads={[{ id: "l1", group: "Scouts", name: "Simon", token: "tok" }]} />);
  const link = screen.getByRole("link", { name: "Open Scouts RSVP list" });
  expect(link).toHaveAttribute("href", "/lead/tok");
});
