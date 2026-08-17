import { describe, expect, it } from "vitest";
import {
  egyptianPhone,
  isPlaceholderEmail,
  normalizeEgyptianPhone,
  placeholderEmailForPhone,
  toAsciiDigits,
} from "./phone";

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

/**
 * The message-free twin of `egyptianPhone`, and the reason it has to exist.
 *
 * Better Auth compares `user.phoneNumber` by EXACT STRING (`findOne` on the
 * raw body value — `plugins/phone-number/routes.mjs`), and its
 * `phoneNumberValidator` hook returns a boolean, so it cannot rewrite what it
 * is handed. Nothing inside the library will ever turn `01012345678` into
 * `+201012345678`. Without one normaliser applied on the way IN, the same
 * student registers as `+20…` and signs in as `0…`, the lookup misses, and the
 * login screen tells them they have no account — while the unique index sits
 * there considering the two strings perfectly distinct.
 *
 * So this is the single funnel every phone passes through before it reaches
 * the database, on the client AND in the server-side hook. `egyptianPhone`
 * below is a thin zod wrapper over it, so the form and the hook can never
 * disagree about what a number means.
 */
describe("normalizeEgyptianPhone", () => {
  it.each([
    ["01012345678", "+201012345678"],
    ["+201012345678", "+201012345678"],
    ["00201012345678", "+201012345678"],
    ["010 1234 5678", "+201012345678"],
    ["٠١٠١٢٣٤٥٦٧٨", "+201012345678"],
    ["  01012345678  ", "+201012345678"],
  ])("normalises %j to %s", (input, expected) => {
    expect(normalizeEgyptianPhone(input)).toBe(expected);
  });

  it.each([
    ["a Saudi number", "+966501234567"],
    ["a short stub", "123"],
    ["empty", ""],
    ["whitespace", "   "],
    ["letters", "not a phone"],
  ])("returns null for %s", (_label, input) => {
    expect(normalizeEgyptianPhone(input)).toBeNull();
  });

  it("is idempotent — normalising an already-normalised number changes nothing", () => {
    const once = normalizeEgyptianPhone("01012345678");
    expect(once).not.toBeNull();
    expect(normalizeEgyptianPhone(once as string)).toBe(once);
  });

  it("agrees with the zod schema on every value the schema accepts", () => {
    for (const input of ["01012345678", "+201112345678", "0223456789"]) {
      const viaSchema = schema.safeParse(input);
      expect(viaSchema.success).toBe(true);
      if (viaSchema.success) {
        expect(normalizeEgyptianPhone(input)).toBe(viaSchema.data);
      }
    }
  });
});

/**
 * Better Auth 1.6.25 hardcodes `email` as a REQUIRED, unique column on its
 * user table (`@better-auth/core/db/get-tables.mjs`) and validates it with a
 * plain `z.string()` — there is no supported switch anywhere in the version
 * that makes it nullable. Making the Postgres column nullable by hand does not
 * help either: Postgres permits unlimited NULLs under a unique index, so
 * `users_email_key` would quietly stop constraining exactly the accounts that
 * need it most.
 *
 * So a student who registers with a phone and declines to give an email still
 * gets an address — a synthesised one, derived from the number so it inherits
 * that number's uniqueness for free.
 *
 * `.invalid` is reserved by RFC 2606 §2 and is guaranteed never to resolve,
 * which is the whole point: this string must be impossible to confuse with a
 * real address, and impossible to accidentally send mail to. `isPlaceholder`
 * is what every display surface calls before printing an email, because a
 * synthesised address shown to an admin reads as corrupted data.
 */
describe("placeholder emails for phone-only accounts", () => {
  it("derives a stable address from the E.164 number", () => {
    expect(placeholderEmailForPhone("+201012345678")).toBe(
      "201012345678@phone.invalid",
    );
  });

  it("is deterministic — the same number always yields the same address", () => {
    expect(placeholderEmailForPhone("+201012345678")).toBe(
      placeholderEmailForPhone("+201012345678"),
    );
  });

  it("gives different numbers different addresses, so the email unique index still bites", () => {
    expect(placeholderEmailForPhone("+201012345678")).not.toBe(
      placeholderEmailForPhone("+201112345678"),
    );
  });

  it("normalises its input, so a non-E.164 number cannot mint a second address for one account", () => {
    expect(placeholderEmailForPhone("01012345678")).toBe(
      placeholderEmailForPhone("+201012345678"),
    );
  });

  it("recognises its own output", () => {
    expect(isPlaceholderEmail(placeholderEmailForPhone("+201012345678"))).toBe(
      true,
    );
  });

  it.each([
    "student@gmail.com",
    "ayman@ayman-platform.com",
    "someone@phone.invalid.com",
    "",
  ])("does not mistake %j for a placeholder", (value) => {
    expect(isPlaceholderEmail(value)).toBe(false);
  });

  it("matches case-insensitively, because Better Auth lowercases every address at sign-up", () => {
    expect(isPlaceholderEmail("201012345678@PHONE.INVALID")).toBe(true);
  });

  it("survives a null or undefined email column", () => {
    expect(isPlaceholderEmail(null)).toBe(false);
    expect(isPlaceholderEmail(undefined)).toBe(false);
  });
});

/**
 * The DISPLAY half of «لو واحد كتب بالعربي، حوّله English».
 *
 * ⚠️ Read `normalizeEgyptianPhone`'s cases above before adding to this block.
 * Validation and storage were never the problem: `٠١٠١٢٣٤٥٦٧٨` has parsed to
 * `+201012345678` for as long as this file has existed, because
 * `libphonenumber-js` folds the digits inside `parsePhoneNumber`. What the
 * student could not do was SEE that, because the field kept the shapes they
 * typed while its own placeholder read «مثال: 01012345678».
 *
 * So this function runs on the way into the input, per keystroke, and these
 * cases are about the string the field ends up showing — not about what the
 * server accepts.
 */
describe("toAsciiDigits", () => {
  it.each([
    // The Arabic-Indic block (U+0660–0669): an Egyptian Android keyboard.
    ["٠١٠١٢٣٤٥٦٧٨", "01012345678"],
    // Extended Arabic-Indic (U+06F0–06F9): the Persian/Urdu set. Several of
    // these are near-identical on screen and every one is a different
    // codepoint, so a single-range implementation passes the case above and
    // silently fails this one.
    ["۰۱۰۱۲۳۴۵۶۷۸", "01012345678"],
    ["٠١٠۱۲۳٤٥٦٧٨", "01012345678"],
  ])("rewrites %s to %s", (input, expected) => {
    expect(toAsciiDigits(input)).toBe(expected);
  });

  it.each([
    // Everything that is not a digit in those two blocks survives untouched —
    // the leading zero, the `+`, and the spaces people group their digits with.
    ["+٢٠ ١٠ ١٢٣٤ ٥٦٧٨", "+20 10 1234 5678"],
    ["01012345678", "01012345678"],
    ["", ""],
    ["+201012345678", "+201012345678"],
  ])("leaves %j as %j", (input, expected) => {
    expect(toAsciiDigits(input)).toBe(expected);
  });

  it("is idempotent, so running it on every keystroke cannot drift", () => {
    const once = toAsciiDigits("٠١٠١٢٣٤٥٦٧٨");
    expect(toAsciiDigits(once)).toBe(once);
  });

  /**
   * The property that makes the caret safe to leave alone.
   *
   * `PhoneField` rewrites `event.target.value` in place and does NOT restore
   * the selection afterwards, on the argument that one codepoint is replaced
   * by one codepoint so the browser's own cursor position stays correct. If a
   * future implementation ever stripped or added a character, an edit in the
   * middle of a number would silently jump the caret — this is the case that
   * fails first.
   */
  it("never changes the length of the string", () => {
    for (const input of ["٠١٠١٢٣٤٥٦٧٨", "+٢٠ ١٠ ١٢٣٤ ٥٦٧٨", "۰۱۰", "abc٣"]) {
      expect(toAsciiDigits(input)).toHaveLength(input.length);
    }
  });

  it("hands the schema a value it already accepted, unchanged in meaning", () => {
    const typed = "٠١٠١٢٣٤٥٦٧٨";
    expect(schema.safeParse(toAsciiDigits(typed))).toEqual(schema.safeParse(typed));
  });
});
