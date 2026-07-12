import { describe, expect, test } from "vitest";
import { getSlotInfo, groupTasksByDay, filterTasksByGroup, coverageFor, filterTasks, facetOptions, partitionByAvailability } from "@/lib/domain/board";
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

describe("partitionByAvailability", () => {
  const sign = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `V${i}`, group: null }));

  test("a partially filled task is available", () => {
    const t = task({ id: "a", neededCount: 3, signups: sign(1) });
    expect(partitionByAvailability([t])).toEqual({ available: [t], claimed: [] });
  });

  test("a full task is claimed", () => {
    const t = task({ id: "a", neededCount: 2, signups: sign(2) });
    expect(partitionByAvailability([t])).toEqual({ available: [], claimed: [t] });
  });

  test("an over-filled task is claimed", () => {
    const t = task({ id: "a", neededCount: 1, signups: sign(3) });
    expect(partitionByAvailability([t])).toEqual({ available: [], claimed: [t] });
  });

  test("preserves the incoming order within each bucket", () => {
    const a1 = task({ id: "a1", neededCount: 2, signups: sign(0) });
    const c1 = task({ id: "c1", neededCount: 1, signups: sign(1) });
    const a2 = task({ id: "a2", neededCount: 2, signups: sign(1) });
    const c2 = task({ id: "c2", neededCount: 2, signups: sign(2) });
    const { available, claimed } = partitionByAvailability([a1, c1, a2, c2]);
    expect(available.map((t) => t.id)).toEqual(["a1", "a2"]);
    expect(claimed.map((t) => t.id)).toEqual(["c1", "c2"]);
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

function facetTask(over: Partial<BoardTask>): BoardTask {
  return {
    id: over.id ?? "t", kind: "shift", title: "T", category: null, requestedGroup: null,
    neededCount: 1, date: null, startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, position: 0, status: "todo", waiting: false,
    signups: [], ...over,
  };
}

describe("filterTasks", () => {
  const tasks = [
    facetTask({ id: "a", requestedGroup: "Scouts", category: "Games", location: "Gym", date: new Date("2026-07-25T00:00:00Z") }),
    facetTask({ id: "b", requestedGroup: "YAO", category: "Games", location: "Stage", date: new Date("2026-07-26T00:00:00Z") }),
    facetTask({ id: "c", requestedGroup: "Scouts", category: "Food", location: "Gym", date: new Date("2026-07-25T00:00:00Z") }),
  ];
  test("an empty facet set returns everything", () => {
    expect(filterTasks(tasks, {}).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
  test("AND across facets (Saturday + Scouts + Games)", () => {
    expect(filterTasks(tasks, { date: "2026-07-25", group: "scouts", category: "Games" }).map((t) => t.id))
      .toEqual(["a"]);
  });
  test("group match is case- and space-insensitive", () => {
    expect(filterTasks(tasks, { group: "  SCOUTS " }).map((t) => t.id)).toEqual(["a", "c"]);
  });
  test("date matches the calendar day", () => {
    expect(filterTasks(tasks, { date: "2026-07-26" }).map((t) => t.id)).toEqual(["b"]);
  });
});

describe("facetOptions", () => {
  test("distinct, sorted, labeled values; blanks ignored", () => {
    const opts = facetOptions([
      facetTask({ requestedGroup: "Scouts", category: "Games", location: "Gym", date: new Date("2026-07-26T00:00:00Z") }),
      facetTask({ requestedGroup: "BWA", category: "Games", location: "", date: new Date("2026-07-25T00:00:00Z") }),
      facetTask({ requestedGroup: "", category: null }),
    ]);
    expect(opts.group).toEqual(["BWA", "Scouts"]);
    expect(opts.category).toEqual(["Games"]);
    expect(opts.location).toEqual(["Gym"]);
    expect(opts.date.map((d) => d.value)).toEqual(["2026-07-25", "2026-07-26"]);
    expect(opts.date[0].label).toMatch(/Jul 25/);
  });
});
