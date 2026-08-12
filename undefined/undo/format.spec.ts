import { describe, expect, it } from "vitest";
import { formatCopy } from "./format";

describe("formatCopy", () => {
  it("substitutes every placeholder", () => {
    expect(formatCopy("لسه فيه {count} سؤال من غير إجابة", { count: 3 })).toBe(
      "لسه فيه 3 سؤال من غير إجابة",
    );
  });

  it("substitutes the same placeholder more than once", () => {
    expect(formatCopy("{n} من {n}", { n: 5 })).toBe("5 من 5");
  });

  it("leaves an unknown placeholder visible instead of writing undefined", () => {
    expect(formatCopy("{hours} ساعة", {})).toBe("{hours} ساعة");
  });

  it("does not treat a substituted value as a template", () => {
    expect(formatCopy("{a}", { a: "{b}" })).toBe("{b}");
  });
});
