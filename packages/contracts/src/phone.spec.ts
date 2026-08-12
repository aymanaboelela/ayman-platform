import { describe, expect, it } from "vitest";
import { egyptianPhone } from "./phone";

/**
 * The tripwire on the hand-filtered metadata blob.
 *
 * `phone.ts` no longer ships `libphonenumber-js`'s 245-country
 * `metadata.min.json`; it passes `eg-metadata.ts`, 366 bytes filtered out of
 * that same file for `libphonenumber-js@1.13.9`. Nothing in the build re-derives
 * that blob, so a version bump that changes Egypt's numbering plan leaves this
 * repository shipping last year's rules — silently, because a stale blob still
 * parses perfectly well. The only symptom would be a student on /register or on
 * المساعد's guest form being told their own number is not Egyptian.
 *
 * So: these cases are the contract. If a bump breaks one, regenerate the blob
 * with the snippet in `eg-metadata.ts`'s header rather than relaxing a case.
 *
 * The message argument is the REQUIRED-field message, not the invalid one — the
 * invalid message is `phone.ts`'s own constant and is asserted directly.
 */
const schema = egyptianPhone("مطلوب");
const INVALID = "رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا";

function parse(value: string) {
  return schema.safeParse(value);
}

describe("egyptianPhone", () => {
  describe("accepts and normalises the ways Egyptians actually type a number", () => {
    it.each([
      // The house style: a national number with its leading zero. This is what
      // a student types, and rejecting it for shape is the single most likely
      // way to lose a registration.
      ["01012345678", "+201012345678"],
      ["+201012345678", "+201012345678"],
      // The IDD prefix, as copied off a business card or out of a contact.
      ["00201012345678", "+201012345678"],
      // Spaces survive: people group their digits.
      ["010 1234 5678", "+201012345678"],
      // Arabic-Indic digits — the default numeral keyboard on an Arabic phone.
      ["٠١٠١٢٣٤٥٦٧٨", "+201012345678"],
    ])("%s → %s", (input, expected) => {
      const result = parse(input);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(expected);
    });

    /*
     * One case per mobile operator. These are the four prefixes that carry
     * essentially every student in the product, and they are the part of the
     * blob most likely to drift: Egypt has added mobile prefixes before, and a
     * blob that predates the addition rejects a whole network's customers while
     * every other case on this page still passes.
     */
    it.each([
      ["Vodafone", "01012345678", "+201012345678"],
      ["Etisalat", "01112345678", "+201112345678"],
      ["Orange", "01212345678", "+201212345678"],
      ["WE", "01512345678", "+201512345678"],
    ])("%s: %s → %s", (_operator, input, expected) => {
      const result = parse(input);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(expected);
    });

    it("accepts a Cairo landline, which a parent may well give", () => {
      const result = parse("0223456789");
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe("+20223456789");
    });
  });

  describe("rejects everything else with the one Arabic message", () => {
    /*
     * The foreign numbers are the cases the metadata swap actually changed:
     * they used to parse as SA/GB and fail the `country !== 'EG'` check, and
     * now throw `INVALID_COUNTRY` because their calling codes are not in the
     * blob at all. Asserting the MESSAGE, not just `success === false`, is what
     * pins that down — the student must not be able to tell which branch ran.
     */
    it.each([
      ["a Saudi number", "+966501234567"],
      ["a UK number", "+447911123456"],
      ["a US number", "+14155552671"],
      ["a short stub", "123"],
      ["too many digits", "01012345678901"],
      ["an EG mobile one digit short", "+201012345"],
    ])("%s (%s)", (_label, input) => {
      const result = parse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message)).toContain(
          INVALID,
        );
      }
    });

    /*
     * Empty and whitespace-only get the REQUIRED message instead, because
     * `.trim().min(1, requiredMessage)` runs before the transform. That is the
     * right behaviour — «مطلوب» on an untouched field, not "this is not an
     * Egyptian number" — and it is worth pinning so a future refactor that
     * moves the trim cannot quietly swap the two.
     */
    it.each(["", "   "])(
      "%j gets the required message, not the invalid one",
      (input) => {
        const result = parse(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.map((issue) => issue.message)).toContain(
            "مطلوب",
          );
        }
      },
    );
  });
});
