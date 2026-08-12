import type { MetadataJson } from "libphonenumber-js/core";

/**
 * `libphonenumber-js` metadata, Egypt and nothing else.
 *
 * ## Why this file exists
 *
 * `phone.ts` used to import `libphonenumber-js` directly, which is the "min"
 * build bundled with `metadata.min.json` — every calling code on earth, 245
 * countries, 84,269 bytes raw / 19,781 gzip. That blob is not a lazy asset: it
 * is a JSON literal the JS engine parses in full before the module finishes
 * evaluating.
 *
 * And it is on the critical path of every page a student can reach, not just
 * the two forms that validate a number. `onboarding.ts` and
 * `assistant/conversation.ts` both import `@ayman/contracts/phone`, and
 * `assistant-widget.tsx` — mounted in the `(site)`, `(app)` AND `(auth)`
 * layouts — imports `@ayman/contracts/assistant/conversation` by subpath. So
 * the landing page opened from a WhatsApp link paid 84 KB to know the calling
 * code of Ascension Island.
 *
 * The validator in `phone.ts` rejects anything whose `parsed.country` is not
 * `'EG'`, so 244 of those 245 countries were dead weight by construction. This
 * blob is 366 bytes.
 *
 * ## How it was generated, and how to regenerate it
 *
 * Filtered out of the installed `libphonenumber-js@1.13.9`'s own
 * `metadata.min.json` — NOT regenerated from upstream's XML. That matters:
 * filtering the installed blob makes this file identical, digit for digit, to
 * what the library would have used for `EG` anyway, so the swap cannot change
 * a single verdict. Regenerating from upstream could quietly disagree with the
 * installed runtime.
 *
 *     node -e "const m=require('libphonenumber-js/metadata.min.json');
 *       console.log(JSON.stringify({version:m.version,
 *         country_calling_codes:{'20':m.country_calling_codes['20']},
 *         countries:{EG:m.countries.EG},nonGeographic:{}}))"
 *
 * Re-run that on every `libphonenumber-js` bump and paste the result below.
 * `phone.spec.ts` is what makes forgetting fail loudly instead of failing a
 * student's registration: it asserts the numbers Egyptians actually type.
 *
 * ## Why `.ts` and not `.json`
 *
 * `apps/api` reaches `phone.ts` at runtime (`onboarding.dto.ts` →
 * `@ayman/contracts/onboarding` → `@ayman/contracts/phone`), and Node loads
 * these sources as ESM TypeScript through type stripping. A bare
 * `import metadata from './eg-metadata.json'` is `ERR_IMPORT_ATTRIBUTE_MISSING`
 * under Node's ESM loader, and the `with { type: 'json' }` form that fixes it
 * then has to survive Turbopack, Vite and SWC as well. A TypeScript module is
 * the one shape all four already agree on — the same class of "green suite,
 * dead server" trap `apps/api/test/contracts-barrel.check.ts` exists to catch.
 *
 * `nonGeographic` is `{}` rather than absent: `source/metadata.js` treats a
 * missing key as legal, but `MetadataJson` declares it required, so the empty
 * object is what keeps the annotation honest without a cast.
 */
export const EG_METADATA: MetadataJson = {
  version: 4,
  country_calling_codes: { "20": ["EG"] },
  countries: {
    EG: [
      "20",
      "00",
      "[189]\\d{8,9}|[24-6]\\d{8}|[135]\\d{7}",
      [8, 9, 10],
      [
        ["(\\d)(\\d{7,8})", "$1 $2", ["[23]"], "0$1"],
        [
          "(\\d{2})(\\d{6,7})",
          "$1 $2",
          ["1[35]|[4-6]|8[2468]|9[235-7]"],
          "0$1",
        ],
        ["(\\d{3})(\\d{3})(\\d{4})", "$1 $2 $3", ["[89]"], "0$1"],
        ["(\\d{2})(\\d{8})", "$1 $2", ["1"], "0$1"],
      ],
      "0",
    ],
  },
  nonGeographic: {},
};
