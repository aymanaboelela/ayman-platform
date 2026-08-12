import { describe, expect, it } from "vitest";
import {
  SubjectOfferingSchema,
  SystemPatchSchema,
  TrackCreateSchema,
  TrackPatchSchema,
} from "./taxonomy";

describe("SystemPatchSchema", () => {
  it("rejects an attempt to change the slug — identity, not copy (A13)", () => {
    expect(SystemPatchSchema.safeParse({ slug: "x" }).success).toBe(false);
  });

  it("accepts a label-only edit", () => {
    expect(SystemPatchSchema.safeParse({ nameAr: "اسم جديد" }).success).toBe(
      true,
    );
  });
});

describe("TrackPatchSchema", () => {
  it("rejects an attempt to change the slug", () => {
    expect(TrackPatchSchema.safeParse({ slug: "x" }).success).toBe(false);
  });

  it("rejects an attempt to change the owning system", () => {
    expect(
      TrackPatchSchema.safeParse({
        systemId: "0191f2a0-1111-7000-8000-000000000000",
      }).success,
    ).toBe(false);
  });
});

describe("TrackCreateSchema", () => {
  it("rejects an uppercase slug", () => {
    expect(
      TrackCreateSchema.safeParse({
        systemId: "0191f2a0-1111-7000-8000-000000000000",
        slug: "Bacalorya",
        labelAr: "مسار",
      }).success,
    ).toBe(false);
  });

  it("rejects a slug containing a space", () => {
    expect(
      TrackCreateSchema.safeParse({
        systemId: "0191f2a0-1111-7000-8000-000000000000",
        slug: "ba lorya",
        labelAr: "مسار",
      }).success,
    ).toBe(false);
  });

  it("accepts a valid lowercase slug with a hyphen", () => {
    expect(
      TrackCreateSchema.safeParse({
        systemId: "0191f2a0-1111-7000-8000-000000000000",
        slug: "science-math",
        labelAr: "مسار",
      }).success,
    ).toBe(true);
  });
});

describe("SubjectOfferingSchema", () => {
  it("rejects a year-1 offering scoped to a track — year 1 is common to all tracks", () => {
    expect(
      SubjectOfferingSchema.safeParse({
        systemId: "0191f2a0-1111-7000-8000-000000000000",
        year: 1,
        trackId: "0191f2a0-2222-7000-8000-000000000000",
        subjectId: "0191f2a0-3333-7000-8000-000000000000",
      }).success,
    ).toBe(false);
  });

  it("accepts a year-1 offering with no track", () => {
    expect(
      SubjectOfferingSchema.safeParse({
        systemId: "0191f2a0-1111-7000-8000-000000000000",
        year: 1,
        trackId: null,
        subjectId: "0191f2a0-3333-7000-8000-000000000000",
      }).success,
    ).toBe(true);
  });

  it("accepts a year-2 offering scoped to a track", () => {
    expect(
      SubjectOfferingSchema.safeParse({
        systemId: "0191f2a0-1111-7000-8000-000000000000",
        year: 2,
        trackId: "0191f2a0-2222-7000-8000-000000000000",
        subjectId: "0191f2a0-3333-7000-8000-000000000000",
      }).success,
    ).toBe(true);
  });
});
