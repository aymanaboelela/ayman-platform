import { describe, expect, it } from "vitest";
import { STORAGE_KEY_PATTERN, MediaPatchSchema } from "./media";

describe("STORAGE_KEY_PATTERN", () => {
  it("accepts the exact generated shape", () => {
    expect(
      STORAGE_KEY_PATTERN.test("ab/0191f2a0-1111-7000-8000-000000000000.webp"),
    ).toBe(true);
  });

  it("rejects an uppercase prefix", () => {
    expect(
      STORAGE_KEY_PATTERN.test("AB/0191f2a0-1111-7000-8000-000000000000.webp"),
    ).toBe(false);
  });

  it("rejects a non-webp extension", () => {
    expect(
      STORAGE_KEY_PATTERN.test("ab/0191f2a0-1111-7000-8000-000000000000.svg"),
    ).toBe(false);
  });

  it("rejects a path-traversal attempt", () => {
    expect(STORAGE_KEY_PATTERN.test("../../etc/passwd")).toBe(false);
  });
});

describe("MediaPatchSchema", () => {
  it("accepts clearing altAr to null", () => {
    expect(MediaPatchSchema.safeParse({ altAr: null }).success).toBe(true);
  });

  it("rejects an unknown key", () => {
    expect(
      MediaPatchSchema.safeParse({ altAr: "وصف", storageKey: "x" }).success,
    ).toBe(false);
  });

  it("rejects an over-long altAr", () => {
    expect(MediaPatchSchema.safeParse({ altAr: "ا".repeat(201) }).success).toBe(
      false,
    );
  });
});
