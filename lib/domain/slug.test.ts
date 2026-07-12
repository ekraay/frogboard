import { describe, expect, test } from "vitest";
import { slugify, isReservedSlug } from "@/lib/domain/slug";

describe("slugify", () => {
  test("lowercases and hyphenates words", () => {
    expect(slugify("Ginza Bazaar")).toBe("ginza-bazaar");
  });
  test("drops punctuation and slashes, collapsing separators", () => {
    expect(slugify("Ginza Bazaar / Bon Odori 2026")).toBe("ginza-bazaar-bon-odori-2026");
  });
  test("trims leading and trailing separators", () => {
    expect(slugify("  ~Spring Fling!~  ")).toBe("spring-fling");
  });
  test("folds accents to ASCII", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });
  test("falls back to 'event' when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("event");
  });
});

describe("isReservedSlug", () => {
  test("flags app paths that would shadow an event", () => {
    expect(isReservedSlug("organize")).toBe(true);
    expect(isReservedSlug("lead")).toBe(true);
    expect(isReservedSlug("e")).toBe(true);
    expect(isReservedSlug("api")).toBe(true);
    expect(isReservedSlug("b")).toBe(true);
  });
  test("allows ordinary event slugs", () => {
    expect(isReservedSlug("ginza-2026")).toBe(false);
  });
});
