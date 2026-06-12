import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const saveTask = vi.fn();
const deleteTaskAction = vi.fn();
const reorderTasksAction = vi.fn();
const setEventStatusAction = vi.fn();
vi.mock("@/app/actions/organize", () => ({
  saveTask: (i: unknown) => saveTask(i),
  deleteTask: (id: string) => deleteTaskAction(id),
  reorderTasks: (e: string, ids: string[]) => reorderTasksAction(e, ids),
  setEventStatusAction: (e: string, s: string) => setEventStatusAction(e, s),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { OrganizeGrid } from "@/components/organize/OrganizeGrid";
import type { GridTask } from "@/lib/repository/organize";

const event = {
  id: "e1", name: "Ginza", status: "draft" as const,
  startDate: new Date("2026-07-24T00:00:00Z"), endDate: new Date("2026-07-26T00:00:00Z"),
};

function gridTask(overrides: Partial<GridTask>): GridTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null, requestedGroup: null,
    neededCount: 5, date: new Date("2026-07-25T00:00:00Z"),
    startAt: new Date("2026-07-25T17:00:00Z"), endAt: new Date("2026-07-25T20:00:00Z"),
    dueBy: null, location: null, description: null, definitionOfDone: null,
    pointOfContact: null, position: 1024, signupCount: 0, ...overrides,
  };
}

beforeEach(() => {
  saveTask.mockReset(); deleteTaskAction.mockReset(); reorderTasksAction.mockReset();
});

test("renders tasks as rows with readable cells", () => {
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("Games");
  expect(screen.getByLabelText("Time, row 1")).toHaveValue("10:00 AM–1:00 PM");
  expect(screen.getByLabelText("Date, row 1")).toHaveValue("Jul 25");
});

test("editing a cell and leaving the row autosaves it", async () => {
  saveTask.mockResolvedValue({ ok: true, taskId: "t1" });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  const title = screen.getByLabelText("Title, row 1");
  await user.clear(title);
  await user.type(title, "Games Booth");
  await user.click(document.body); // leave the row
  await screen.findByText(/saved/i);
  expect(saveTask).toHaveBeenCalledOnce();
  const input = saveTask.mock.calls[0][0] as { taskId: string; cells: { title: string } };
  expect(input.taskId).toBe("t1");
  expect(input.cells.title).toBe("Games Booth");
});

test("an unparseable cell marks the row and pauses its saving", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  const need = screen.getByLabelText("Need, row 1");
  await user.clear(need);
  await user.type(need, "lots");
  await user.click(document.body);
  expect(await screen.findByText(/needs attention/i)).toBeInTheDocument();
  expect(saveTask).not.toHaveBeenCalled();
});

test("expanding a row reveals the prose fields with their question prompts", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  const expander = screen.getByRole("button", { name: /details, row 1/i });
  expect(expander).toHaveAttribute("aria-expanded", "false");
  await user.click(expander);
  expect(expander).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByPlaceholderText("What is this about? Why is it important?")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("What does done look like?")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Who can help?")).toBeInTheDocument();
});
