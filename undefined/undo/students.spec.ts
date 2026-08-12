import { describe, expect, it } from "vitest";
import { AdminRoleChangeSchema, AdminStudentPatchSchema } from "./students";

describe("AdminStudentPatchSchema", () => {
  it("rejects a role field riding along on a profile patch (A4)", () => {
    expect(AdminStudentPatchSchema.safeParse({ role: "admin" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown key", () => {
    expect(AdminStudentPatchSchema.safeParse({ userId: "x" }).success).toBe(
      false,
    );
  });

  it("rejects an empty patch", () => {
    expect(AdminStudentPatchSchema.safeParse({}).success).toBe(false);
  });

  it("accepts clearing schoolName to null", () => {
    expect(
      AdminStudentPatchSchema.safeParse({ schoolName: null }).success,
    ).toBe(true);
  });

  it("accepts a partial fullName-only patch", () => {
    expect(
      AdminStudentPatchSchema.safeParse({ fullName: "اسم جديد" }).success,
    ).toBe(true);
  });
});

describe("AdminRoleChangeSchema", () => {
  it("rejects a reason shorter than 8 characters", () => {
    expect(
      AdminRoleChangeSchema.safeParse({ role: "admin", reason: "قصير" })
        .success,
    ).toBe(false);
  });

  it("rejects a role outside the enum", () => {
    expect(
      AdminRoleChangeSchema.safeParse({
        role: "superadmin",
        reason: "a valid reason",
      }).success,
    ).toBe(false);
  });

  it("accepts a valid role change with a real reason", () => {
    expect(
      AdminRoleChangeSchema.safeParse({
        role: "admin",
        reason: "ترقية بناءً على طلب الإدارة",
      }).success,
    ).toBe(true);
  });
});
