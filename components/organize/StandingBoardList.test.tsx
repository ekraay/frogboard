import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const setEventStatusAction = vi.fn();
const deleteEventAction = vi.fn();
vi.mock("@/app/actions/organize", () => ({
  setEventStatusAction: (id: string, s: string) => setEventStatusAction(id, s),
  deleteEventAction: (id: string) => deleteEventAction(id),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { StandingBoardList } from "@/components/organize/StandingBoardList";
import type { StandingBoardItem } from "@/lib/repository/organize";

function board(overrides: Partial<StandingBoardItem> = {}): StandingBoardItem {
  return { id: "b1", name: "Temple needs", slug: "temple-needs", status: "draft", taskCount: 3, ...overrides };
}

beforeEach(() => {
  setEventStatusAction.mockReset(); deleteEventAction.mockReset();
  setEventStatusAction.mockResolvedValue({ ok: true });
  deleteEventAction.mockResolvedValue({ ok: true });
});

test("links each board to its workspace and its public page", () => {
  render(<StandingBoardList boards={[board()]} />);
  expect(screen.getByRole("link", { name: /temple needs/i })).toHaveAttribute("href", "/organize/b1");
  expect(screen.getByRole("link", { name: /view board/i })).toHaveAttribute("href", "/temple-needs");
});

test("renders nothing when there are no ongoing boards", () => {
  const { container } = render(<StandingBoardList boards={[]} />);
  expect(container).toBeEmptyDOMElement();
});

test("omits the public link until the board has a slug", () => {
  render(<StandingBoardList boards={[board({ slug: null })]} />);
  expect(screen.queryByRole("link", { name: /view board/i })).not.toBeInTheDocument();
});

test("an active board can be archived", async () => {
  const user = userEvent.setup();
  render(<StandingBoardList boards={[board()]} />);
  await user.click(screen.getByRole("button", { name: /archive temple needs/i }));
  expect(setEventStatusAction).toHaveBeenCalledWith("b1", "archived");
});

test("archived boards move to the Archived section", () => {
  render(<StandingBoardList boards={[board(), board({ id: "b2", name: "Old Temple", status: "archived" })]} />);
  expect(screen.getByText(/archived \(1\)/i)).toBeInTheDocument();
  // the archived board is out of the active list: no workspace link
  expect(screen.queryByRole("link", { name: /old temple/i })).toBeNull();
  expect(screen.getByRole("button", { name: /restore old temple/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /delete old temple/i })).toBeInTheDocument();
});

test("an all-archived list keeps the section and says so", () => {
  render(<StandingBoardList boards={[board({ status: "archived" })]} />);
  expect(screen.getByRole("heading", { name: /ongoing boards/i })).toBeInTheDocument();
  expect(screen.getByText(/all ongoing boards are archived\./i)).toBeInTheDocument();
  expect(screen.getByText(/archived \(1\)/i)).toBeInTheDocument();
});
