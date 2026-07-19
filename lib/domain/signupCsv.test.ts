import { describe, expect, test } from "vitest";
import { signupCsvRows, toCsv, type SignupExportRecord } from "@/lib/domain/signupCsv";

const base: SignupExportRecord = {
  taskTitle: "Games booth", taskKind: "shift",
  taskDate: new Date("2026-07-25T00:00:00Z"),
  startAt: new Date("2026-07-25T20:00:00Z"), // 1:00 PM PDT
  endAt: new Date("2026-07-25T23:00:00Z"),   // 4:00 PM PDT
  category: "Games", position: 0,
  name: "Kenji Sato", email: "k@x.com", phone: null, group: "Scouts",
  minor: null, createdAt: new Date("2026-07-18T22:30:00Z"), // 3:30 PM PDT
};

describe("signupCsvRows", () => {
  test("header row first, then one row per signup", () => {
    const rows = signupCsvRows([base]);
    expect(rows[0]).toEqual(["Task", "Kind", "Date", "Time", "Category", "Name", "Email", "Phone", "Group", "Minor", "Signed up"]);
    expect(rows).toHaveLength(2);
  });

  test("calendar day stays the stored day; instants render in Pacific local time", () => {
    const [, row] = signupCsvRows([base]);
    expect(row[2]).toBe("2026-07-25");           // UTC calendar day, not shifted to 07-24
    expect(row[3]).toBe("1:00 PM–4:00 PM");      // EVENT_TZ wall clock
    expect(row[10]).toBe("2026-07-18 3:30 PM");  // EVENT_TZ wall clock
  });

  test("kind uses display words and minor shows Yes or blank", () => {
    const rows = signupCsvRows([
      { ...base, taskKind: "errand", minor: true },
      { ...base, name: "Adult", minor: null },
    ]);
    expect(rows[1][1]).toBe("Task");
    expect(rows[1][9]).toBe("Yes");
    expect(rows[2][9]).toBe("");
  });

  test("dateless and timeless tasks leave Date and Time blank", () => {
    const [, row] = signupCsvRows([{ ...base, taskDate: null, startAt: null, endAt: null }]);
    expect(row[2]).toBe("");
    expect(row[3]).toBe("");
  });

  test("orders by task date, start, position, then signup time; dateless tasks last", () => {
    const early = { ...base, name: "A", position: 1 };
    const laterDay = { ...base, name: "B", taskDate: new Date("2026-07-26T00:00:00Z") };
    const standing = { ...base, name: "C", taskDate: null, startAt: null, endAt: null };
    const sameTaskLater = { ...base, name: "D", position: 1, createdAt: new Date("2026-07-19T01:00:00Z") };
    const firstPosition = { ...base, name: "E", position: 0 };
    const names = signupCsvRows([standing, laterDay, sameTaskLater, early, firstPosition]).slice(1).map((r) => r[5]);
    expect(names).toEqual(["E", "A", "D", "B", "C"]);
  });

  test("guards volunteer-typed cells against formula injection", () => {
    const [, row] = signupCsvRows([
      { ...base, name: "=HYPERLINK(1)", group: "+Scouts", email: "=cmd()", phone: "@1234" },
    ]);
    expect(row[5]).toBe("'=HYPERLINK(1)");
    expect(row[8]).toBe("'+Scouts");
    expect(row[6]).toBe("'=cmd()");
    expect(row[7]).toBe("'@1234");
    expect(row[0]).toBe("Games booth"); // organizer-typed title untouched
  });

  test("empty input yields just the header row", () => {
    expect(signupCsvRows([])).toEqual([
      ["Task", "Kind", "Date", "Time", "Category", "Name", "Email", "Phone", "Group", "Minor", "Signed up"],
    ]);
  });
});

describe("toCsv", () => {
  test("quotes cells with commas, quotes, and newlines; joins with CRLF", () => {
    expect(toCsv([["a", "b,c"], ['say "hi"', "x\ny"]])).toBe('a,"b,c"\r\n"say ""hi""","x\ny"');
  });

  test("adds no BOM", () => {
    expect(toCsv([["a"]]).charCodeAt(0)).toBe(97);
  });

  test("header-only rows produce a single line with no trailing CRLF", () => {
    const csv = toCsv(signupCsvRows([]));
    expect(csv).toBe("Task,Kind,Date,Time,Category,Name,Email,Phone,Group,Minor,Signed up");
    expect(csv.endsWith("\r\n")).toBe(false);
  });
});
