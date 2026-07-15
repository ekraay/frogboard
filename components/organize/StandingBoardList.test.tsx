import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { StandingBoardList } from "@/components/organize/StandingBoardList";
import type { StandingBoardItem } from "@/lib/repository/organize";

function board(overrides: Partial<StandingBoardItem> = {}): StandingBoardItem {
  return { id: "b1", name: "Temple needs", slug: "temple-needs", status: "draft", taskCount: 3, ...overrides };
}

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
