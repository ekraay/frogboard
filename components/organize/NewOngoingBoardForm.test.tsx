import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NewOngoingBoardForm } from "@/components/organize/NewOngoingBoardForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/actions/organize", () => ({ createStandingBoardAction: vi.fn() }));

test("renders a name field and a create button", () => {
  render(<NewOngoingBoardForm />);
  expect(screen.getByRole("heading", { name: /ongoing board/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/temple needs/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create board/i })).toBeInTheDocument();
});
