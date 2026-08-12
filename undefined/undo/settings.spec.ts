import { describe, expect, it } from "vitest";
import {
  BrandingSchema,
  ContactSchema,
  SeoSchema,
  SiteSettingsSchema,
} from "./settings";

describe("BrandingSchema", () => {
  it("applies the amber/default token slots when nothing was ever saved", () => {
    const parsed = BrandingSchema.parse({});
    expect(parsed.accent).toBe("amber");
    expect(parsed.radius).toBe("default");
    expect(parsed.logoLightAssetId).toBeNull();
  });

  it("rejects a colour that is not a token slot — there is no free-text colour input", () => {
    expect(BrandingSchema.safeParse({ accent: "#ff0000" }).success).toBe(false);
    expect(
      BrandingSchema.safeParse({ accent: "oklch(0.7 0.2 30)" }).success,
    ).toBe(false);
    expect(
      BrandingSchema.safeParse({ accent: "amber; } body { display: none" })
        .success,
    ).toBe(false);
  });

  it("rejects green and red accents outright — those are reserved for quiz correctness", () => {
    expect(BrandingSchema.safeParse({ accent: "green" }).success).toBe(false);
    expect(BrandingSchema.safeParse({ accent: "red" }).success).toBe(false);
  });

  it("rejects a logo reference that is not a uuid", () => {
    expect(
      BrandingSchema.safeParse({
        logoLightAssetId: "https://evil.example/x.svg",
      }).success,
    ).toBe(false);
  });

  it("is strict — an unknown key is a failure, not a silently kept extra", () => {
    expect(
      BrandingSchema.safeParse({ accent: "amber", customCss: "body{}" })
        .success,
    ).toBe(false);
  });
});

describe("SeoSchema", () => {
  it("caps the meta description at 160 characters", () => {
    expect(
      SeoSchema.safeParse({ descriptionAr: "ا".repeat(161) }).success,
    ).toBe(false);
    expect(
      SeoSchema.safeParse({ descriptionAr: "ا".repeat(160) }).success,
    ).toBe(true);
  });

  it("caps the title at 70 characters", () => {
    expect(SeoSchema.safeParse({ titleAr: "ا".repeat(71) }).success).toBe(
      false,
    );
  });
});

describe("ContactSchema", () => {
  it("requires E.164 for phone and whatsapp", () => {
    expect(ContactSchema.safeParse({ phone: "01001234567" }).success).toBe(
      false,
    );
    expect(ContactSchema.safeParse({ phone: "+201001234567" }).success).toBe(
      true,
    );
  });

  it("refuses an http:// social link — a mixed-content link in the footer is a bug, not a choice", () => {
    expect(
      ContactSchema.safeParse({ facebook: "http://facebook.com/x" }).success,
    ).toBe(false);
    expect(
      ContactSchema.safeParse({ facebook: "https://facebook.com/x" }).success,
    ).toBe(true);
  });
});

describe("SiteSettingsSchema", () => {
  it("parses an empty blob into a fully defaulted object", () => {
    const parsed = SiteSettingsSchema.parse({});
    expect(parsed.branding.accent).toBe("amber");
    expect(parsed.seo.titleAr).toBe("");
    expect(parsed.contact.whatsapp).toBeNull();
  });

  /**
   * Zod 4 changed `.default()` to short-circuit: it returns the given value
   * as-is WITHOUT running the inner schema, so `BrandingSchema.default({})`
   * would yield a literal `{}` and `settings.branding.accent` would be
   * `undefined` at runtime while typing as `AccentSlot`. `.prefault()` is the
   * Zod 4 spelling of the old behaviour. This test is the guard.
   */
  it("section defaults are PARSED, not passed through raw", () => {
    const parsed = SiteSettingsSchema.parse({});
    expect(Object.keys(parsed.branding).sort()).toEqual([
      "accent",
      "faviconAssetId",
      "logoDarkAssetId",
      "logoLightAssetId",
      "radius",
    ]);
  });

  it("merges a partially-written blob without dropping the untouched sections", () => {
    const parsed = SiteSettingsSchema.parse({ branding: { accent: "cyan" } });
    expect(parsed.branding.accent).toBe("cyan");
    expect(parsed.branding.radius).toBe("default");
    expect(parsed.seo.descriptionAr).toBe("");
  });
});
