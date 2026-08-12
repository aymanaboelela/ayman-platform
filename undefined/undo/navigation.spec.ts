import { describe, expect, it } from "vitest";
import { NavigationCreateSchema, ReorderSchema } from "./navigation";

describe("NavigationCreateSchema", () => {
  it("rejects an absolute off-site href — open-redirect / stored-XSS surface", () => {
    expect(
      NavigationCreateSchema.safeParse({
        labelAr: "رابط",
        href: "https://evil.example",
      }).success,
    ).toBe(false);
  });

  it("rejects a javascript: href", () => {
    expect(
      NavigationCreateSchema.safeParse({
        labelAr: "رابط",
        href: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("rejects an href with no leading slash", () => {
    expect(
      NavigationCreateSchema.safeParse({ labelAr: "رابط", href: "courses" })
        .success,
    ).toBe(false);
  });

  it("accepts a valid site-relative href", () => {
    expect(
      NavigationCreateSchema.safeParse({
        labelAr: "الكورسات",
        href: "/courses",
      }).success,
    ).toBe(true);
  });
});

describe("ReorderSchema", () => {
  const uuid1 = "0191f2a0-1111-7000-8000-000000000000";
  const uuid2 = "0191f2a0-2222-7000-8000-000000000000";

  it("rejects a duplicated id", () => {
    expect(
      ReorderSchema.safeParse({ parentId: null, ids: [uuid1, uuid1] }).success,
    ).toBe(false);
  });

  it("accepts a valid ordered list, including a null parentId for the top level", () => {
    expect(
      ReorderSchema.safeParse({ parentId: null, ids: [uuid1, uuid2] }).success,
    ).toBe(true);
  });
});
