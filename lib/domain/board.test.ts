import { describe, expect, test } from "vitest";
import { getSlotInfo, groupTasksByDay } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null,
    requestedGroup: null, neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
    startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, status: "todo", waiting: false,
    signups: [], ...overrides,
  };
}

describe("getSlotInfo", () => {
  test("counts filled vs needed", () => {
    const t = task({
      neededCount: 3,
      signups: [
        { id: "s1", name: "Ann", group: null, minor: null },
        { id: "s2", name: "Bob", group: null, minor: null },
      ],
    });
    expect(getSlotInfo(t)).toEqual({ filled: 2, needed: 3, isFull: false });
  });
  test("isFull when filled reaches needed", () => {
    const t = task({
      neededCount: 1,
      signups: [{ id: "s1", name: "Ann", group: null, minor: null }],
    });
    expect(getSlotInfo(t)).toEqual({ filled: 1, needed: 1, isFull: true });
  });
});

describe("groupTasksByDay", () => {
  test("groups by date, sorts days ascending, all-day group last", () => {
    const result = groupTasksByDay([
      task({ id: "b", date: new Date("2026-07-26T00:00:00Z") }),
      task({ id: "a", date: new Date("2026-07-25T00:00:00Z") }),
      task({ id: "c", date: null }),
    ]);
    expect(result.map((g) => g.key)).toEqual(["2026-07-25", "2026-07-26", "all-day"]);
  });
  test("sorts tasks within a day by startAt, timed before all-day", () => {
    const [group] = groupTasksByDay([
      task({ id: "allday", startAt: null }),
      task({ id: "late", startAt: new Date("2026-07-25T21:00:00Z") }),
      task({ id: "early", startAt: new Date("2026-07-25T17:00:00Z") }),
    ]);
    expect(group.tasks.map((t) => t.id)).toEqual(["early", "late", "allday"]);
  });
});
