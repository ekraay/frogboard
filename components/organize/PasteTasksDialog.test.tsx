import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { PasteTasksDialog } from "@/components/organize/PasteTasksDialog";

const onAdd = vi.fn();
const onClose = vi.fn();
beforeEach(() => { onAdd.mockReset(); onClose.mockReset(); });

test("previews exactly the tasks that will be created", async () => {
  const user = userEvent.setup();
  render(<PasteTasksDialog onAdd={onAdd} onClose={onClose} />);
  await user.click(screen.getByLabelText(/tasks, one per line/i));
  await user.paste("Games booth\n\nBingo"); // blank line dropped
  const preview = screen.getByRole("list", { name: /preview/i });
  expect(within(preview).getAllByRole("listitem")).toHaveLength(2); // blank line dropped
  expect(within(preview).getByText("Games booth")).toBeInTheDocument();
  expect(within(preview).getByText("Bingo")).toBeInTheDocument();
});

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
  const cells = onAdd.mock.calls[0][0] as { title: string }[];
  expect(cells.map((c) => c.title)).toEqual(["Games booth", "Bingo", "Food service"]);
});

test("pulls the name, time, and count from multi-column lines (not the date)", async () => {
  const user = userEvent.setup();
  render(<PasteTasksDialog onAdd={onAdd} onClose={onClose} />);
  await user.click(screen.getByLabelText(/tasks, one per line/i));
  // sheet shape: date \t task \t time \t count
  await user.paste(
    "Tuesday, July 21\tLayout tables\t6:00 PM - 10:00 PM\t15\n" +
    "Wednesday, July 22\tBingo\t6:00 PM - 10:00 PM\t5",
  );
  const preview = screen.getByRole("list", { name: /preview/i });
  // the NAME shows, not the date
  expect(within(preview).getByText("Layout tables")).toBeInTheDocument();
  expect(within(preview).getByText("Bingo")).toBeInTheDocument();
  expect(within(preview).queryByText("Tuesday, July 21")).toBeNull();
  // time and count show too
  expect(within(preview).getAllByText("6:00 PM - 10:00 PM")).toHaveLength(2);
  expect(within(preview).getByText("15")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /add 2 tasks/i }));
  const cells = onAdd.mock.calls[0][0] as { title: string; time: string; need: string }[];
  expect(cells[0]).toMatchObject({ title: "Layout tables", time: "6:00 PM - 10:00 PM", need: "15" });
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
