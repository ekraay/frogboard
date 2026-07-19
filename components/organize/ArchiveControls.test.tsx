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

import { ArchiveButton, ArchivedSection } from "@/components/organize/ArchiveControls";

beforeEach(() => {
  setEventStatusAction.mockReset(); deleteEventAction.mockReset();
  setEventStatusAction.mockResolvedValue({ ok: true });
  deleteEventAction.mockResolvedValue({ ok: true });
});

test("ArchiveButton archives its item", async () => {
  const user = userEvent.setup();
  render(<ArchiveButton id="b1" name="Temple Needs" />);
  await user.click(screen.getByRole("button", { name: /archive temple needs/i }));
  expect(setEventStatusAction).toHaveBeenCalledWith("b1", "archived");
});

test("ArchivedSection shows the count and restores to draft", async () => {
  const user = userEvent.setup();
  render(<ArchivedSection items={[{ id: "a", name: "Old Board" }]} />);
  expect(screen.getByText(/archived \(1\)/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /restore old board/i }));
  expect(setEventStatusAction).toHaveBeenCalledWith("a", "draft");
});

test("deleting asks for confirmation first", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<ArchivedSection items={[{ id: "a", name: "Old Board" }]} />);
  await user.click(screen.getByRole("button", { name: /delete old board/i }));
  expect(confirmSpy).toHaveBeenCalled();
  expect(deleteEventAction).toHaveBeenCalledWith("a");
  confirmSpy.mockRestore();
});

test("declining the delete confirm does nothing", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  render(<ArchivedSection items={[{ id: "a", name: "Old Board" }]} />);
  await user.click(screen.getByRole("button", { name: /delete old board/i }));
  expect(deleteEventAction).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});

test("ArchivedSection renders nothing when empty", () => {
  const { container } = render(<ArchivedSection items={[]} />);
  expect(container).toBeEmptyDOMElement();
});
