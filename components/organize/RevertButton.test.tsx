import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const revertChange = vi.fn();
vi.mock("@/app/actions/organize", () => ({ revertChange: (id: string) => revertChange(id) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RevertButton } from "@/components/organize/RevertButton";

beforeEach(() => { revertChange.mockReset(); refresh.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

test("reverts after the organizer confirms, then refreshes", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  revertChange.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<RevertButton auditId="a1" label="Deleted: Games" />);
  await user.click(screen.getByRole("button", { name: /revert/i }));
  expect(revertChange).toHaveBeenCalledWith("a1");
  expect(refresh).toHaveBeenCalled();
});

test("does nothing when the organizer cancels", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  render(<RevertButton auditId="a1" label="x" />);
  await user.click(screen.getByRole("button", { name: /revert/i }));
  expect(revertChange).not.toHaveBeenCalled();
});

test("shows the error when the revert fails", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  revertChange.mockResolvedValue({ ok: false, error: "That task is gone." });
  const user = userEvent.setup();
  render(<RevertButton auditId="a1" label="x" />);
  await user.click(screen.getByRole("button", { name: /revert/i }));
  expect(await screen.findByText("That task is gone.")).toBeInTheDocument();
});
