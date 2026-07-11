import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const updateEventSlugAction = vi.fn();
vi.mock("@/app/actions/organize", () => ({
  updateEventSlugAction: (id: string, slug: string) => updateEventSlugAction(id, slug),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { SlugEditor } from "@/components/organize/SlugEditor";

beforeEach(() => { updateEventSlugAction.mockReset(); refresh.mockReset(); });

test("shows the current public link", () => {
  render(<SlugEditor eventId="e1" slug="ginza-2026" />);
  expect(screen.getByDisplayValue("ginza-2026")).toBeInTheDocument();
});

test("saves an edited slug", async () => {
  updateEventSlugAction.mockResolvedValue({ ok: true, slug: "ginza-2027" });
  const user = userEvent.setup();
  render(<SlugEditor eventId="e1" slug="ginza-2026" />);
  const input = screen.getByLabelText(/link/i);
  await user.clear(input);
  await user.type(input, "Ginza 2027");
  await user.click(screen.getByRole("button", { name: /save/i }));
  expect(updateEventSlugAction).toHaveBeenCalledWith("e1", "Ginza 2027");
  expect(refresh).toHaveBeenCalled();
});

test("calls onSaved after a successful save", async () => {
  updateEventSlugAction.mockResolvedValue({ ok: true, slug: "ginza-2027" });
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(<SlugEditor eventId="e1" slug="ginza-2026" onSaved={onSaved} />);
  await user.click(screen.getByRole("button", { name: /save/i }));
  expect(onSaved).toHaveBeenCalled();
});

test("surfaces an error", async () => {
  updateEventSlugAction.mockResolvedValue({ ok: false, error: "That link is already taken." });
  const user = userEvent.setup();
  render(<SlugEditor eventId="e1" slug="ginza-2026" />);
  await user.click(screen.getByRole("button", { name: /save/i }));
  expect(await screen.findByText("That link is already taken.")).toBeInTheDocument();
});
