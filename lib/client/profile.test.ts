import { describe, expect, test, beforeEach } from "vitest";
import { rememberProfile, getProfile } from "@/lib/client/profile";

beforeEach(() => window.localStorage.clear());

describe("profile", () => {
  test("returns empty defaults when nothing is saved", () => {
    expect(getProfile()).toEqual({ name: "", group: "" });
  });
  test("round-trips name and group", () => {
    rememberProfile({ name: "Kenji", group: "Scouts" });
    expect(getProfile()).toEqual({ name: "Kenji", group: "Scouts" });
  });
  test("tolerates malformed storage", () => {
    window.localStorage.setItem("frogboard.profile", "not json");
    expect(getProfile()).toEqual({ name: "", group: "" });
  });
});
