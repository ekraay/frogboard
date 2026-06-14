import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { PasteTasksDialog } from "@/components/organize/PasteTasksDialog";

const onAdd = vi.fn();
const onClose = vi.fn();
beforeEach(() => { onAdd.mockReset(); onClose.mockReset(); });

test("turns each pasted line into a task and reports the count", async () => {
  const user = userEvent.setup();
  render(<PasteTasksDialog onAdd={onAdd} onClose={onClose} />);
  // the affordance explains itself
  expect(screen.getByText(/each line becomes a task/i)).toBeInTheDocument();
  const box = screen.getByLabelText(/tasks, one per line/i);
  await user.click(box);
  await user.paste("Games booth\nBingo\n\nFood service");
  // live count on the button, blank line ignored
  const add = screen.getByRole("button", { name: /add 3 tasks/i });
  await user.click(add);
  expect(onAdd).toHaveBeenCalledWith(["Games booth", "Bingo", "Food service"]);
});

test("Add is disabled until there's at least one line", () => {
  render(<PasteTasksDialog onAdd={onAdd} onClose={onClose} />);
  expect(screen.getByRole("button", { name: /add tasks/i })).toBeDisabled();
});

test("Cancel closes without adding", async () => {
  const user = userEvent.setup();
  render(<PasteTasksDialog onAdd={onAdd} onClose={onClose} />);
  await user.click(screen.getByRole("button", { name: /cancel/i }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(onAdd).not.toHaveBeenCalled();
});
