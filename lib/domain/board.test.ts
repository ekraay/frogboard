import { describe, expect, test } from "vitest";
import { getSlotInfo, groupTasksByDay, filterTasksByGroup, coverageFor } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null,
    requestedGroup: null, neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
    startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, status: "todo", waiting: false,
    position: 0, signups: [], ...overrides,
  };
}

describe("getSlotInfo", () => {
  test("counts filled vs needed", () => {
    const t = task({
      neededCount: 3,
      signups: [
        { id: "s1", name: "Ann", group: null },
        { id: "s2", name: "Bob", group: null },
      ],
    });
    expect(getSlotInfo(t)).toEqual({ filled: 2, needed: 3, isFull: false });
  });
  test("isFull when filled reaches needed", () => {
    const t = task({
      neededCount: 1,
      signups: [{ id: "s1", name: "Ann", group: null }],
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
  test("groups by the `date` field, not the Pacific day of startAt", () => {
    // Characterization of a known tension (exploratory charter #7): `date` is a
    // UTC calendar day; times render in Pacific. A task dated Jul 26 whose
    // startAt (05:00Z) is actually Jul 25 10pm PDT still groups under Jul 26.
    // Phase 2's organizer UI must derive `date` from startAt's Pacific day.
    const [group] = groupTasksByDay([
      task({
        date: new Date("2026-07-26T00:00:00Z"),
        startAt: new Date("2026-07-26T05:00:00Z"),
        endAt: new Date("2026-07-26T06:00:00Z"),
      }),
    ]);
    expect(group.key).toBe("2026-07-26");
    expect(group.label).toBe("Sunday, Jul 26");
  });
  test("sorts tasks within a day by position — the organizer's order is the order", () => {
    const [group] = groupTasksByDay([
      task({ id: "third", position: 3072, startAt: new Date("2026-07-25T15:00:00Z") }),
      task({ id: "first", position: 1024, startAt: new Date("2026-07-25T21:00:00Z") }),
      task({ id: "second", position: 2048, startAt: null }),
    ]);
    expect(group.tasks.map((t) => t.id)).toEqual(["first", "second", "third"]);
  });
});

describe("filterTasksByGroup", () => {
  test("keeps only tasks whose requestedGroup matches, case- and space-insensitively", () => {
    const tasks = [
      task({ id: "a", requestedGroup: "Scouts" }),
      task({ id: "b", requestedGroup: "YAO" }),
      task({ id: "c", requestedGroup: " scouts " }),
      task({ id: "d", requestedGroup: null }),
    ];
    expect(filterTasksByGroup(tasks, "scouts").map((t) => t.id)).toEqual(["a", "c"]);
  });
  test("a blank filter returns everything (no filtering)", () => {
    const tasks = [task({ id: "a", requestedGroup: "Scouts" }), task({ id: "b", requestedGroup: null })];
    expect(filterTasksByGroup(tasks, "").map((t) => t.id)).toEqual(["a", "b"]);
    expect(filterTasksByGroup(tasks, "   ").map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("coverageFor", () => {
  test("counts the fully-staffed tasks out of the total", () => {
    const tasks = [
      task({ id: "a", neededCount: 1, signups: [{ id: "s1", name: "Ann", group: null }] }), // full
      task({ id: "b", neededCount: 2, signups: [{ id: "s2", name: "Bo", group: null }] }),   // 1 of 2
      task({ id: "c", neededCount: 1, signups: [] }),                                         // 0 of 1
    ];
    expect(coverageFor(tasks)).toEqual({ covered: 1, total: 3 });
  });
  test("an empty list is zero of zero", () => {
    expect(coverageFor([])).toEqual({ covered: 0, total: 0 });
  });
});
