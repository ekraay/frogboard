import { describe, expect, test } from "vitest";
import { hashExternalId } from "@/lib/security/hash";

describe("hashExternalId", () => {
  test("is deterministic and trims", () => {
    expect(hashExternalId("135291163")).toBe(hashExternalId(" 135291163 "));
  });
  test("differs by input and never returns the raw id", () => {
    const h = hashExternalId("135291163");
    expect(h).not.toBe(hashExternalId("14878458"));
    expect(h).not.toContain("135291163");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
