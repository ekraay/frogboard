import { StrictMode } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const saveTask = vi.fn();
const deleteTaskAction = vi.fn();
const clearTasksAction = vi.fn();
const reorderTasksAction = vi.fn();
const setEventStatusAction = vi.fn();
vi.mock("@/app/actions/organize", () => ({
  saveTask: (i: unknown) => saveTask(i),
  deleteTask: (id: string) => deleteTaskAction(id),
  clearTasks: (e: string, ids: string[]) => clearTasksAction(e, ids),
  reorderTasks: (e: string, ids: string[]) => reorderTasksAction(e, ids),
  setEventStatusAction: (e: string, s: string) => setEventStatusAction(e, s),
  updateEventSlugAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { OrganizeGrid } from "@/components/organize/OrganizeGrid";
import type { GridTask } from "@/lib/repository/organize";

const event = {
  id: "e1", name: "Ginza", status: "draft" as const, slug: "ginza-2026",
  startDate: new Date("2026-07-24T00:00:00Z"), endDate: new Date("2026-07-26T00:00:00Z"),
  standing: false,
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
  saveTask.mockReset(); deleteTaskAction.mockReset(); clearTasksAction.mockReset();
  reorderTasksAction.mockReset(); setEventStatusAction.mockReset();
});

test("the live banner links to the public board", () => {
  render(<OrganizeGrid event={{ ...event, status: "published" }} initialTasks={[]} />);
  const link = screen.getByRole("link", { name: /frogboard\.vercel\.app\/ginza-2026/i });
  expect(link).toHaveAttribute("href", "/ginza-2026");
});

test("the draft banner shows where it will publish, without a live link", () => {
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  expect(screen.getByText(/will publish to frogboard\.vercel\.app\/ginza-2026/i)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /frogboard\.vercel\.app/i })).not.toBeInTheDocument();
});

test("Copy link copies the public URL", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<OrganizeGrid event={{ ...event, status: "published" }} initialTasks={[]} />);
  await user.click(screen.getByRole("button", { name: /copy link/i }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/ginza-2026"));
});

test("Edit link reveals the inline slug editor", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  expect(screen.queryByLabelText(/public link slug/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /edit link/i }));
  expect(screen.getByLabelText(/public link slug/i)).toBeInTheDocument();
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

test("paste lands at the focused cell, filling that column and growing rows", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  await user.click(screen.getByRole("button", { name: /add row/i })); // one empty row to anchor on
  const tsv = "Rice cooking\tshift\tSat Jul 25\t2\t6:30 AM - 3:00 PM\nGrilling\tshift\t\t4\t8-11am";
  await user.click(screen.getByLabelText("Title, row 1")); // anchor: row 1, Title column
  await user.paste(tsv);
  // first pasted row fills the anchored (empty) row 1; the second appends as row 2
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("Rice cooking");
  expect(screen.getByLabelText("Title, row 2")).toHaveValue("Grilling");
  expect(screen.getByLabelText("Date, row 2")).toHaveValue("Sat Jul 25"); // carried forward
});

test("a single-column paste into Time fills Time without disturbing Title", async () => {
  saveTask.mockResolvedValue({ ok: true, taskId: "t-x" });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    gridTask({ id: "a", title: "Games", startAt: null, endAt: null }),
    gridTask({ id: "b", title: "Bingo", startAt: null, endAt: null }),
  ]} />);
  await user.click(screen.getByLabelText("Time, row 1")); // anchor on the Time column
  await user.paste("10:00 AM - 1:00 PM\n1:00 PM - 4:00 PM");
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("Games"); // untouched
  expect(screen.getByLabelText("Title, row 2")).toHaveValue("Bingo");
  expect(screen.getByLabelText("Time, row 1")).toHaveValue("10:00 AM - 1:00 PM");
  expect(screen.getByLabelText("Time, row 2")).toHaveValue("1:00 PM - 4:00 PM");
});

test("pasting inside the Paste-a-list modal does not leak into the grid", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  await user.click(screen.getByRole("button", { name: "📋 Paste a list" }));
  const box = screen.getByLabelText(/tasks, one per line/i);
  await user.click(box);
  await user.paste("Setup\nCleanup");
  // the modal received the text (its count updates)…
  expect(screen.getByRole("button", { name: /add 2 tasks/i })).toBeInTheDocument();
  // …and the grid did NOT create rows from the modal's paste
  expect(screen.queryByLabelText("Title, row 1")).toBeNull();
});

const standing = { ...event, standing: true, startDate: null, endDate: null };

test("on a standing board, a pasted column defaults new rows to frog", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={standing} initialTasks={[]} />);
  await user.click(screen.getByRole("button", { name: /add row/i })); // anchor row (already frog)
  await user.click(screen.getByLabelText("Title, row 1"));
  await user.paste("Trim hedges\nRake leaves"); // two titles: row 1 filled, row 2 appended
  expect(screen.getByLabelText("Kind, row 1")).toHaveValue("quick");
  expect(screen.getByLabelText("Kind, row 2")).toHaveValue("quick"); // the appended row, not shift
});

test("on a standing board, the Paste-a-list modal defaults tasks to frog", async () => {
  saveTask.mockResolvedValue({ ok: true, taskId: "t-x" });
  const user = userEvent.setup();
  render(<OrganizeGrid event={standing} initialTasks={[]} />);
  await user.click(screen.getByRole("button", { name: "📋 Paste a list" }));
  const box = screen.getByLabelText(/tasks, one per line/i);
  await user.click(box);
  await user.paste("Trim hedges\nRake leaves");
  await user.click(screen.getByRole("button", { name: /add 2 tasks/i }));
  expect(screen.getByLabelText("Kind, row 1")).toHaveValue("quick");
  expect(screen.getByLabelText("Kind, row 2")).toHaveValue("quick");
});

test("delete is deferred; undo cancels it and restores the row intact (signups included)", () => {
  vi.useFakeTimers();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  fireEvent.click(screen.getByRole("button", { name: /delete, row 1/i }));
  expect(screen.queryByLabelText("Title, row 1")).toBeNull();
  expect(deleteTaskAction).not.toHaveBeenCalled(); // deferred — nothing destroyed yet
  fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("Games");
  expect(saveTask).not.toHaveBeenCalled(); // same task id — no re-create needed
  act(() => { vi.runOnlyPendingTimers(); });
  expect(deleteTaskAction).not.toHaveBeenCalled(); // undo cancelled the timer
  vi.useRealTimers();
});

test("without undo, the server delete fires when the window closes", () => {
  vi.useFakeTimers();
  deleteTaskAction.mockResolvedValue({ ok: true });
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  fireEvent.click(screen.getByRole("button", { name: /delete, row 1/i }));
  expect(deleteTaskAction).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(10_000); });
  expect(deleteTaskAction).toHaveBeenCalledWith("t1");
  vi.useRealTimers();
});

test("Clear all is absent when the grid is empty", () => {
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  expect(screen.queryByRole("button", { name: /clear all/i })).toBeNull();
});

test("Clear all asks before wiping; declining keeps the rows", () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
  expect(confirmSpy).toHaveBeenCalled();
  expect(screen.getByLabelText("Title, row 1")).toBeInTheDocument();
  confirmSpy.mockRestore();
});

test("Clear all shows a persistent inline banner and Undo restores every row", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    gridTask({ id: "t1", title: "First", position: 1024 }),
    gridTask({ id: "t2", title: "Second", position: 2048 }),
  ]} />);
  await user.click(screen.getByRole("button", { name: /clear all/i }));
  expect(screen.queryByLabelText("Title, row 1")).toBeNull();
  expect(screen.getByText(/cleared 2 tasks/i)).toBeInTheDocument(); // persistent banner, no fading toast
  expect(clearTasksAction).not.toHaveBeenCalled(); // deferred — nothing destroyed yet
  await user.click(screen.getByRole("button", { name: /^undo$/i }));
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("First");
  expect(screen.getByLabelText("Title, row 2")).toHaveValue("Second");
  expect(clearTasksAction).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});

test("Clear all commits the batched delete when you next add a row", async () => {
  clearTasksAction.mockResolvedValue({ ok: true, count: 2 });
  saveTask.mockResolvedValue({ ok: true, taskId: "t-new" });
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    gridTask({ id: "t1", title: "First", position: 1024 }),
    gridTask({ id: "t2", title: "Second", position: 2048 }),
  ]} />);
  await user.click(screen.getByRole("button", { name: /clear all/i }));
  expect(clearTasksAction).not.toHaveBeenCalled(); // still deferred while the banner shows
  await user.click(screen.getByRole("button", { name: /add row/i })); // next action commits it
  expect(clearTasksAction).toHaveBeenCalledWith("e1", ["t1", "t2"]);
  confirmSpy.mockRestore();
});

test("valid pasted rows persist immediately; unparseable ones wait flagged", async () => {
  saveTask.mockResolvedValue({ ok: true, taskId: "t-pasted" });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  await user.click(screen.getByRole("button", { name: /add row/i }));
  const title = screen.getByLabelText("Title, row 1");
  await user.click(title);
  await user.paste("Rice cooking\tshift\tSat Jul 25\t2\t6:30 AM - 3:00 PM\nMystery\tshift\tJul 25\tlots\t");
  await screen.findByText(/needs attention/i); // the 'lots' row is flagged
  expect(saveTask).toHaveBeenCalledTimes(1); // only the valid pasted row saved
  const input = saveTask.mock.calls[0][0] as { cells: { title: string } };
  expect(input.cells.title).toBe("Rice cooking");
});

test("an unsaved row moved between saved rows lands there when it saves", async () => {
  saveTask.mockResolvedValue({ ok: true, taskId: "t-new" });
  reorderTasksAction.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    gridTask({ id: "t1", title: "First", position: 1024 }),
    gridTask({ id: "t2", title: "Second", position: 2048 }),
  ]} />);
  await user.click(screen.getByRole("button", { name: /add row/i })); // row 3, unsaved
  await user.type(screen.getByLabelText("Title, row 3"), "Middle");
  await user.click(screen.getByRole("button", { name: /move up, row 3/i })); // now row 2
  expect(screen.getByLabelText("Title, row 2")).toHaveValue("Middle");
  await user.click(document.body); // blur → the new row saves
  await screen.findByText(/saved/i);
  // after the create, the grid reconciles the visual order with the server
  expect(reorderTasksAction).toHaveBeenLastCalledWith("e1", ["t1", "t-new", "t2"]);
});

test("deleting a row with signups asks for confirmation first", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({ signupCount: 2 })]} />);
  await user.click(screen.getByRole("button", { name: /delete, row 1/i }));
  expect(confirmSpy).toHaveBeenCalled();
  expect(screen.getByLabelText("Title, row 1")).toBeInTheDocument(); // declined → stays
  confirmSpy.mockRestore();
});

test("Alt+ArrowUp moves a row and persists the new order", async () => {
  reorderTasksAction.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    gridTask({ id: "t1", title: "First", position: 1024 }),
    gridTask({ id: "t2", title: "Second", position: 2048 }),
  ]} />);
  const second = screen.getByLabelText("Title, row 2");
  await user.click(second);
  await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("Second");
  expect(reorderTasksAction).toHaveBeenCalledWith("e1", ["t2", "t1"]);
});

test("Open sign-ups flips the banner to Live", async () => {
  setEventStatusAction.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  expect(screen.getByText(/draft/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /open sign-ups/i }));
  expect(await screen.findByText(/live/i)).toBeInTheDocument();
  expect(setEventStatusAction).toHaveBeenCalledWith("e1", "published");
  expect(screen.getByRole("button", { name: /close sign-ups/i })).toBeInTheDocument();
});

test("a thrown saveTask lands the row in an attention state, not a stuck spinner", async () => {
  saveTask.mockRejectedValue(new Error("network down"));
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  const title = screen.getByLabelText("Title, row 1");
  await user.clear(title);
  await user.type(title, "Games Booth");
  await user.click(document.body);
  expect(await screen.findByText(/needs attention/i)).toBeInTheDocument();
  expect(screen.getByText(/couldn't save|server error|retry/i)).toBeInTheDocument();
});

test("explanations are tucked behind ? popovers, not shown as a wall of text", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  // nothing explanatory is shown until asked
  expect(screen.queryByText(/each line becomes a task/i)).toBeNull();
  expect(screen.queryByText(/one-off need/i)).toBeNull();
  // Paste-a-list help opens on demand
  await user.click(screen.getByRole("button", { name: /how .*paste a list/i }));
  expect(screen.getByText(/each line becomes a task/i)).toBeInTheDocument();
  // Kind help explains Shift vs Frog
  await user.click(screen.getByRole("button", { name: /shift vs frog/i }));
  expect(screen.getByText(/one-off need/i)).toBeInTheDocument();
});

test("fill-down fills only the empty cells below — it never overwrites", async () => {
  saveTask.mockResolvedValue({ ok: true, taskId: "t-x" });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    gridTask({ id: "a", title: "Booth A", location: "Gym" }),
    gridTask({ id: "b", title: "Booth B", location: "Kitchen" }), // already has a value
    gridTask({ id: "c", title: "Booth C", location: null }),       // empty
  ]} />);
  await user.click(screen.getByLabelText("Location, row 1"));
  await user.click(screen.getByRole("button", { name: /fill location down.*row 1/i }));
  expect(screen.getByLabelText("Location, row 1")).toHaveValue("Gym");      // source, unchanged
  expect(screen.getByLabelText("Location, row 2")).toHaveValue("Kitchen");  // left alone
  expect(screen.getByLabelText("Location, row 3")).toHaveValue("Gym");      // was empty → filled
  // only the row we actually filled is saved; the one we left alone is untouched
  await screen.findByText(/saved/i);
  const ids = saveTask.mock.calls.map((c) => (c[0] as { taskId: string }).taskId);
  expect(ids).toContain("c");
  expect(ids).not.toContain("b");
});

test("undo after Clear all restores each row exactly once (StrictMode-safe, no duplicate keys)", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(
    <StrictMode>
      <OrganizeGrid event={event} initialTasks={[
        gridTask({ id: "t1", title: "First", position: 1024 }),
        gridTask({ id: "t2", title: "Second", position: 2048 }),
      ]} />
    </StrictMode>,
  );
  await user.click(screen.getByRole("button", { name: /clear all/i }));
  await user.click(screen.getByRole("button", { name: /^undo$/i }));
  // exactly the two originals come back — not duplicated by a double-invoked updater
  expect(screen.getAllByLabelText(/^Title, row/)).toHaveLength(2);
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("First");
  expect(screen.getByLabelText("Title, row 2")).toHaveValue("Second");
  confirmSpy.mockRestore();
});

test("a toolbar Undo control appears only when there's something to undo, and reverses it", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({ id: "t1", title: "First" })]} />);
  expect(screen.queryByRole("button", { name: /undo last change/i })).toBeNull(); // nothing pending
  await user.click(screen.getByRole("button", { name: /clear all/i }));
  await user.click(screen.getByRole("button", { name: /undo last change/i }));
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("First");
  confirmSpy.mockRestore();
});

test("Cmd+Z undoes the last action when focus is not in a cell", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    gridTask({ id: "t1", title: "First", position: 1024 }),
    gridTask({ id: "t2", title: "Second", position: 2048 }),
  ]} />);
  await user.click(screen.getByRole("button", { name: /clear all/i }));
  expect(screen.queryByLabelText("Title, row 1")).toBeNull();
  (document.activeElement as HTMLElement | null)?.blur();
  await user.keyboard("{Meta>}z{/Meta}");
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("First");
  expect(screen.getByLabelText("Title, row 2")).toHaveValue("Second");
  confirmSpy.mockRestore();
});

test("Cmd+Z while editing a cell is left to the browser (no grid undo)", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    gridTask({ id: "t1", title: "First", position: 1024 }),
    gridTask({ id: "t2", title: "Second", position: 2048 }),
  ]} />);
  fireEvent.click(screen.getByRole("button", { name: /delete, row 1/i })); // pending undo exists
  const cell = screen.getByLabelText("Title, row 1"); // "Second" is now row 1
  cell.focus();
  await user.keyboard("{Meta>}z{/Meta}");
  // grid undo did NOT fire — still one row, the deleted "First" was not restored
  // (jsdom inserts the literal "z" into the focused input; a real browser would
  // run its own text-undo instead — either way our grid undo stayed out of it).
  expect(screen.getAllByLabelText(/^Title, row/)).toHaveLength(1);
  expect(screen.queryByDisplayValue(/^First$/)).toBeNull();
});

// --- Sortable column headers ---

const baseTask = (over: Partial<GridTask>): GridTask => ({
  id: over.id ?? "t", kind: "shift", title: "T", category: null, requestedGroup: null,
  neededCount: 1, date: null, startAt: null, endAt: null, dueBy: null, location: null,
  description: null, definitionOfDone: null, pointOfContact: null,
  position: over.position ?? 1024, signupCount: 0, ...over,
});
const sortEvent = {
  id: "e1", name: "E", status: "draft" as const, slug: null,
  startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26"),
  standing: false,
};
function titlesInOrder(): string[] {
  return screen.getAllByLabelText(/^Title, row/i).map((el) => (el as HTMLInputElement).value);
}

test("clicking a column header sorts the rows; Manual order restores them", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={sortEvent} initialTasks={[
    baseTask({ id: "a", title: "Setup", position: 1024 }),
    baseTask({ id: "b", title: "Bingo", position: 2048 }),
  ]} />);
  expect(titlesInOrder()).toEqual(["Setup", "Bingo"]);
  await user.click(screen.getByRole("button", { name: /sort by title/i }));
  expect(titlesInOrder()).toEqual(["Bingo", "Setup"]);
  await user.click(screen.getByRole("button", { name: /manual order/i }));
  expect(titlesInOrder()).toEqual(["Setup", "Bingo"]);
});

test("reorder buttons disable while sorted", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={sortEvent} initialTasks={[
    baseTask({ id: "a", title: "Setup" }), baseTask({ id: "b", title: "Bingo", position: 2048 }),
  ]} />);
  await user.click(screen.getByRole("button", { name: /sort by title/i }));
  expect(screen.getAllByRole("button", { name: /move up/i })[0]).toBeDisabled();
});

test("offers existing categories as datalist suggestions", () => {
  render(<OrganizeGrid
    event={{ id: "e1", name: "Temple", status: "draft", slug: null, startDate: null, endDate: null, standing: true }}
    initialTasks={[{ id: "t1", kind: "mission", title: "Trim hedges", category: "Grounds", requestedGroup: null,
      neededCount: 1, date: null, startAt: null, endAt: null, dueBy: null, location: null, description: null,
      definitionOfDone: null, pointOfContact: null, position: 1024, signupCount: 0 }]} />);
  const option = document.querySelector('datalist option[value="Grounds"]');
  expect(option).not.toBeNull();
});
