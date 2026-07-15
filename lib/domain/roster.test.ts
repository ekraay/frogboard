import { describe, expect, test } from "vitest";
import { statusCounts, rosterView, patrolSummary, parsePersonRows, type RosterPerson } from "@/lib/domain/roster";
import type { RsvpRecord } from "@/lib/domain/rsvp";

function person(id: string, subGroup: string | null): RosterPerson {
  return { id, name: `Name ${id}`, subGroup, minor: true, position: null };
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

describe("rosterView", () => {
  test("includes every person, needs-attention first (blank, maybe, yes, no), then by name", () => {
    const people = [person("y", "Hawk"), person("b", "Hawk"), person("m", "Hawk"), person("n", "Hawk")];
    const byPerson = map([
      ["y", [{ day: null, status: "yes" }]],
      ["m", [{ day: null, status: "maybe" }]],
      ["n", [{ day: null, status: "no" }]],
      // b is blank
    ]);
    const rows = rosterView(people, byPerson)[0].people;
    expect(rows.map((p) => p.status)).toEqual(["blank", "maybe", "yes", "no"]);
  });
  test("blank sorts before an alphabetically earlier maybe within a sub-group", () => {
    const people = [person("a", "Hawk"), person("z", "Hawk")];
    const byPerson = map([["a", [{ day: null, status: "maybe" }]]]);
    const rows = rosterView(people, byPerson)[0].people;
    expect(rows.map((p) => [p.id, p.status])).toEqual([["z", "blank"], ["a", "maybe"]]);
  });
  test("groups by sub-group, groups alphabetical, null under 'Ungrouped'", () => {
    const groups = rosterView([person("a", "Hawk"), person("b", null)], map([]));
    expect(groups.map((g) => g.subGroup)).toEqual(["Hawk", "Ungrouped"]);
  });
  test("carries status, reason and position, never the minor flag", () => {
    const people: RosterPerson[] = [{ id: "a", name: "Alex T.", subGroup: "Hawk", minor: true, position: "PL" }];
    const byPerson = map([["a", [{ day: null, status: "no", reason: "Away" }]]]);
    const row = rosterView(people, byPerson)[0].people[0];
    expect(row).toMatchObject({ status: "no", reason: "Away", position: "PL" });
    expect(row).not.toHaveProperty("minor");
  });
});

describe("patrolSummary", () => {
  test("tallies each status per sub-group and names the patrol leader", () => {
    const people: RosterPerson[] = [
      { id: "pl", name: "Lead A.", subGroup: "Hawk", minor: true, position: "PL" },
      { id: "b", name: "Bee B.", subGroup: "Hawk", minor: true, position: null },
      { id: "c", name: "Cy C.", subGroup: "Fox", minor: true, position: null },
    ];
    const byPerson = map([
      ["pl", [{ day: null, status: "yes" }]],
      ["b", [{ day: null, status: "no" }]],
    ]);
    const summary = patrolSummary(people, byPerson);
    expect(summary.map((s) => s.subGroup)).toEqual(["Fox", "Hawk"]);
    const hawk = summary.find((s) => s.subGroup === "Hawk")!;
    expect(hawk.counts).toEqual({ yes: 1, maybe: 0, no: 1, blank: 0 });
    expect(hawk.leader).toBe("Lead A.");
    expect(summary.find((s) => s.subGroup === "Fox")!.leader).toBeNull();
  });
  test("null sub-group tallies under 'Ungrouped'", () => {
    const summary = patrolSummary([person("a", null)], map([]));
    expect(summary[0].subGroup).toBe("Ungrouped");
  });
});

describe("parsePersonRows", () => {
  test("maps First/Last/Patrol/Position/Scout ID by header, skips blanks", () => {
    const raw = [
      "First Name\tLast Name\tPatrol\tPosition\tScout ID",
      "Simon\tKraay\t\tSPL\t135291163",
      "Naoto\tThompson\tHawk\tPL\t135684307",
      "\t\t\t\t",
    ].join("\n");
    expect(parsePersonRows(raw)).toEqual([
      { name: "Simon Kraay", subGroup: null, position: "SPL", externalId: "135291163" },
      { name: "Naoto Thompson", subGroup: "Hawk", position: "PL", externalId: "135684307" },
    ]);
  });
  test("does not mistake a 'Paid' column for the Scout ID column", () => {
    const raw = [
      "First Name\tLast Name\tPaid\tScout ID",
      "Simon\tKraay\tYes\t135291163",
    ].join("\n");
    expect(parsePersonRows(raw)).toEqual([
      { name: "Simon Kraay", subGroup: null, position: null, externalId: "135291163" },
    ]);
  });
  test("accepts a Team column as the sub-group and tolerates a missing Scout ID", () => {
    const raw = ["First Name\tLast Name\tTeam", "Ava\tLin\tTeam A"].join("\n");
    expect(parsePersonRows(raw)).toEqual([
      { name: "Ava Lin", subGroup: "Team A", position: null, externalId: null },
    ]);
  });
});
