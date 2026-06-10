import { expect, test } from "vitest";
import { claimAuditDetails, releaseAuditDetails } from "@/lib/domain/audit";

test("claimAuditDetails records who joined", () => {
  expect(claimAuditDetails({ signupId: "s1", name: "Kenji", group: "Scouts" })).toEqual({
    summary: "Kenji claimed a slot", signupId: "s1", name: "Kenji", group: "Scouts",
  });
});

test("releaseAuditDetails snapshots the removed signup for revert", () => {
  expect(
    releaseAuditDetails({
      signupId: "s1", name: "Kenji", group: null,
      email: "k@x.com", phone: null, minor: true,
    }),
  ).toEqual({
    summary: "Kenji was removed", signupId: "s1", name: "Kenji", group: null,
    email: "k@x.com", phone: null, minor: true,
  });
});
