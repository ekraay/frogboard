import { describe, expect, test } from "vitest";
import { statusCounts, chaseList, type RosterPerson } from "@/lib/domain/roster";
import type { RsvpRecord } from "@/lib/domain/rsvp";

function person(id: string, subGroup: string | null): RosterPerson {
  return { id, name: `Name ${id}`, subGroup, minor: true };
}
function map(entries: [string, RsvpRecord[]][]): Map<string, RsvpRecord[]> {
  return new Map(entries);
}

describe("statusCounts", () => {
  test("counts each effective status, blank when absent", () => {
    const people = [person("a", "Hawk"), person("b", "Hawk"), person("c", "Fox")];
    const byPerson = map([
      ["a", [{ day: null, status: "yes" }]],
      ["b", [{ day: null, status: "no" }]],
    ]);
    expect(statusCounts(people, byPerson)).toEqual({ yes: 1, maybe: 0, no: 1, blank: 1 });
  });
});

describe("chaseList", () => {
  test("keeps only blank and maybe, blank first, grouped by sub-group", () => {
    const people = [person("a", "Hawk"), person("b", "Hawk"), person("c", "Fox")];
    const byPerson = map([
      ["a", [{ day: null, status: "yes" }]],   // answered yes, dropped
      ["b", [{ day: null, status: "maybe" }]],  // maybe, chased
      // c is blank, chased
    ]);
    const groups = chaseList(people, byPerson);
    expect(groups.map((g) => g.subGroup)).toEqual(["Fox", "Hawk"]);
    expect(groups.find((g) => g.subGroup === "Hawk")!.people.map((p) => p.id)).toEqual(["b"]);
    expect(groups.find((g) => g.subGroup === "Fox")!.people.map((p) => p.status)).toEqual(["blank"]);
  });
  test("blank sorts before maybe within a sub-group, even against name order", () => {
    // "Name a" (maybe) sorts before "Name z" (blank), so status rank must win.
    const people = [person("a", "Hawk"), person("z", "Hawk")];
    const byPerson = map([["a", [{ day: null, status: "maybe" }]]]);
    const groups = chaseList(people, byPerson);
    expect(groups[0].people.map((p) => p.status)).toEqual(["blank", "maybe"]);
  });
  test("null sub-group collects under 'Ungrouped'", () => {
    const groups = chaseList([person("a", null)], map([]));
    expect(groups[0].subGroup).toBe("Ungrouped");
  });
});
