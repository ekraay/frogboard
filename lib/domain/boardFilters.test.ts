import { expect, test } from "vitest";
import type { BoardTask } from "@/lib/domain/types";
import {
  emptyFilters, hasAnyFilter, effectiveWhen, isDueSoon, hasBigGap, sortByGap, applyBoardFilters,
} from "@/lib/domain/boardFilters";

function task(over: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null, requestedGroup: null,
    neededCount: 3, date: null, startAt: null, endAt: null, dueBy: null,
    pointOfContact: null, location: null, definitionOfDone: null, status: "todo",
    waiting: false, position: 0, signups: [], ...over,
  };
}
const NOW = new Date("2026-07-22T12:00:00Z"); // Wednesday

test("emptyFilters has no active filter", () => {
  expect(hasAnyFilter(emptyFilters())).toBe(false);
});
test("any populated section is an active filter", () => {
  expect(hasAnyFilter({ ...emptyFilters(), group: ["Scouts"] })).toBe(true);
  expect(hasAnyFilter({ ...emptyFilters(), keyword: "cup" })).toBe(true);
  expect(hasAnyFilter({ ...emptyFilters(), dueSoon: true })).toBe(true);
  expect(hasAnyFilter({ ...emptyFilters(), bigGap: true })).toBe(true);
});

test("effectiveWhen prefers a deadline, then the day, else null", () => {
  const d = new Date("2026-07-25T00:00:00Z");
  const due = new Date("2026-07-23T17:00:00Z");
  expect(effectiveWhen(task({ date: d, dueBy: due }))?.toISOString()).toBe(due.toISOString());
  expect(effectiveWhen(task({ date: d, dueBy: null }))?.toISOString()).toBe(d.toISOString());
  expect(effectiveWhen(task({ date: null, dueBy: null }))).toBeNull();
});

test("isDueSoon: within three calendar days, overdue included, undated never", () => {
  expect(isDueSoon(task({ date: new Date("2026-07-25T00:00:00Z") }), NOW)).toBe(true); // now+3
  expect(isDueSoon(task({ date: new Date("2026-07-26T00:00:00Z") }), NOW)).toBe(false); // now+4
  expect(isDueSoon(task({ date: new Date("2026-07-20T00:00:00Z") }), NOW)).toBe(true); // overdue
  expect(isDueSoon(task({ date: null, dueBy: null }), NOW)).toBe(false);
});
test("isDueSoon counts a dueBy by its calendar day", () => {
  expect(isDueSoon(task({ dueBy: new Date("2026-07-25T23:00:00Z") }), NOW)).toBe(true);
});

test("hasBigGap: needs two or more still-open spots", () => {
  expect(hasBigGap(task({ neededCount: 3, signups: [] }))).toBe(true);              // gap 3
  expect(hasBigGap(task({ neededCount: 2, signups: [{ id: "s", name: "A", group: null }] }))).toBe(false); // gap 1
  expect(hasBigGap(task({ neededCount: 1, signups: [] }))).toBe(false);             // gap 1
  expect(hasBigGap(task({ neededCount: 2, signups: [] }))).toBe(true);              // gap 2
});

test("applyBoardFilters: empty filters return all", () => {
  const ts = [task({ id: "a" }), task({ id: "b" })];
  expect(applyBoardFilters(ts, emptyFilters(), NOW).map((t) => t.id)).toEqual(["a", "b"]);
});
test("keyword is a case-insensitive substring of the title", () => {
  const ts = [task({ id: "a", title: "Cup washing" }), task({ id: "b", title: "Games" })];
  expect(applyBoardFilters(ts, { ...emptyFilters(), keyword: "CUP" }, NOW).map((t) => t.id)).toEqual(["a"]);
});
test("group matches trimmed and case-insensitive, internal spaces significant (OR within)", () => {
  const ts = [
    task({ id: "a", requestedGroup: "Troop 29" }),
    task({ id: "b", requestedGroup: "YAO" }),
    task({ id: "c", requestedGroup: "Troop29" }),
  ];
  const got = applyBoardFilters(ts, { ...emptyFilters(), group: [" troop 29 ", "yao"] }, NOW);
  expect(got.map((t) => t.id)).toEqual(["a", "b"]);
});
test("date matches the task calendar day; AND across sections", () => {
  const ts = [
    task({ id: "a", category: "Food", date: new Date("2026-07-25T00:00:00Z") }),
    task({ id: "b", category: "Food", date: new Date("2026-07-26T00:00:00Z") }),
  ];
  const f = { ...emptyFilters(), category: ["Food"], date: ["2026-07-25"] };
  expect(applyBoardFilters(ts, f, NOW).map((t) => t.id)).toEqual(["a"]);
});
test("dueSoon keeps only tasks due within three days", () => {
  const ts = [
    task({ id: "a", date: new Date("2026-07-24T00:00:00Z") }),
    task({ id: "b", date: new Date("2026-07-30T00:00:00Z") }),
  ];
  expect(applyBoardFilters(ts, { ...emptyFilters(), dueSoon: true }, NOW).map((t) => t.id)).toEqual(["a"]);
});
test("bigGap keeps only tasks still needing two or more", () => {
  const ts = [
    task({ id: "a", neededCount: 3, signups: [] }),
    task({ id: "b", neededCount: 1, signups: [] }),
  ];
  expect(applyBoardFilters(ts, { ...emptyFilters(), bigGap: true }, NOW).map((t) => t.id)).toEqual(["a"]);
});
test("sortByGap orders by the largest unfilled gap first, then position", () => {
  const ts = [
    task({ id: "small", neededCount: 2, signups: [], position: 1 }),        // gap 2
    task({ id: "big", neededCount: 5, signups: [], position: 2 }),          // gap 5
    task({ id: "tie", neededCount: 2, signups: [], position: 0 }),          // gap 2, lower position
  ];
  expect(sortByGap(ts).map((t) => t.id)).toEqual(["big", "tie", "small"]);
});
test("sortByGap does not mutate its input", () => {
  const ts = [task({ id: "a", neededCount: 1 }), task({ id: "b", neededCount: 3 })];
  sortByGap(ts);
  expect(ts.map((t) => t.id)).toEqual(["a", "b"]);
});

import { parseBoardFilters, filtersToQuery, type BoardFilters } from "@/lib/domain/boardFilters";

// Turn a query string into the object shape Next hands a page (repeated keys -> array).
function record(query: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    const prev = out[k];
    if (prev === undefined) out[k] = v;
    else out[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}
function roundTrip(f: BoardFilters): BoardFilters {
  return parseBoardFilters(record(filtersToQuery(f)));
}

test("empty filters serialize to an empty string and round-trip", () => {
  expect(filtersToQuery(emptyFilters())).toBe("");
  expect(roundTrip(emptyFilters())).toEqual(emptyFilters());
});
test("multi-select uses repeated keys and round-trips", () => {
  const f: BoardFilters = { ...emptyFilters(), group: ["Scouts", "Parents"], date: ["2026-07-25"] };
  expect(filtersToQuery(f)).toContain("group=Scouts");
  expect(filtersToQuery(f)).toContain("group=Parents");
  expect(roundTrip(f)).toEqual(f);
});
test("a value containing a comma survives (repeated keys, not comma-join)", () => {
  const f: BoardFilters = { ...emptyFilters(), category: ["Food, Drink", "Games"] };
  expect(roundTrip(f)).toEqual(f);
});
test("keyword, dueSoon and bigGap round-trip", () => {
  const f: BoardFilters = { ...emptyFilters(), keyword: "cups", dueSoon: true, bigGap: true };
  expect(filtersToQuery(f)).toContain("q=cups");
  expect(filtersToQuery(f)).toContain("due=soon");
  expect(filtersToQuery(f)).toContain("gap=big");
  expect(roundTrip(f)).toEqual(f);
});
test("parse accepts a bare string or an array and ignores unknown/empty keys", () => {
  expect(parseBoardFilters({ group: "Scouts", junk: "x", category: "" })).toEqual({
    ...emptyFilters(), group: ["Scouts"],
  });
  expect(parseBoardFilters({ group: ["A", "B"] }).group).toEqual(["A", "B"]);
});
test("parse never throws on odd input", () => {
  expect(() => parseBoardFilters({ due: ["soon", "soon"], date: [] })).not.toThrow();
});
