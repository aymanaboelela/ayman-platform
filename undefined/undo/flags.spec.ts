import { describe, expect, it } from "vitest";
import { FLAG_DECLARATIONS, isEnabled } from "./flags";

describe("FLAG_DECLARATIONS", () => {
  it("has no duplicate keys", () => {
    const keys = FLAG_DECLARATIONS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isEnabled", () => {
  it("returns the declared default when no row exists for the key", () => {
    expect(isEnabled([], "quiz.practiceMode")).toBe(true);
    expect(isEnabled([], "catalog.showComingSoon")).toBe(false);
  });

  it("returns the row value when one exists, overriding the default", () => {
    const flags = [
      {
        key: "catalog.showComingSoon",
        descriptionAr: "x",
        enabled: true,
        updatedAt: "now",
      },
    ];
    expect(isEnabled(flags, "catalog.showComingSoon")).toBe(true);
  });

  it("returns false for an undeclared key even when a row says true", () => {
    const flags = [
      {
        key: "not.declared",
        descriptionAr: "x",
        enabled: true,
        updatedAt: "now",
      },
    ];
    expect(isEnabled(flags, "not.declared" as never)).toBe(false);
  });
});
