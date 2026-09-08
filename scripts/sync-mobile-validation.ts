/**
 * Extracts the FORM VALIDATION messages from the zod schemas in
 * `packages/contracts` and emits them as Dart constants.
 *
 * ## Why this is a second generator and not part of sync-mobile-copy.ts
 *
 * The product's prose lives in `copy/ar.ts` and flattens cleanly into a key
 * table. The validation messages do NOT live there — they are string literals
 * inside the schemas themselves (`z.string().min(1, 'كلمة المرور مطلوبة')`),
 * where they belong, because a message and the rule that produces it have to
 * change together.
 *
 * That makes them unreachable by object traversal. So instead of parsing the
 * TypeScript, this RUNS each schema against deliberately invalid input and
 * reads the messages back off the issues. The output is therefore the exact
 * string a web student sees, produced by the same code path, rather than a
 * transcription that can drift.
 *
 * ⚠️ Adding a field to a schema does not automatically add it here — the
 * probes below name the fields explicitly, because "parse an empty object and
 * take whatever comes out" would silently stop covering a field the moment it
 * gained a `.default()`. `pnpm mobile:validation` prints anything it could not
 * reach.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LoginSchema, RegisterSchema } from '../packages/contracts/src/auth.ts';
import { OnboardingSchema } from '../packages/contracts/src/onboarding.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OUT = path.resolve(REPO, 'apps/mobile/lib/core/localization/validation_messages.dart');

interface Probe {
  /** The Dart constant name. */
  name: string;
  /** Human note that becomes the doc comment. */
  why: string;
  /** Runs the schema and returns the message for `field`, or null. */
  run: () => string | null;
}

/**
 * Parses `input` and returns the first issue message on `field`.
 *
 * `safeParse`, never `parse`: a throwing probe would abort the whole
 * generation on the first schema change instead of reporting which probe went
 * stale.
 */
function messageFor(
  schema: { safeParse: (value: unknown) => { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  input: unknown,
  field: string,
): string | null {
  const result = schema.safeParse(input);
  if (result.success || !result.error) return null;
  const issue = result.error.issues.find((i) => i.path[0] === field);
  return issue?.message ?? null;
}

const VALID_PASSWORD = 'a-password-8+';

/** Any character in the Arabic block. See the filter below for why. */
const ARABIC = /[\u0600-\u06FF]/;

const PROBES: Probe[] = [
  {
    name: 'loginIdentifierRequired',
    why: 'The one sign-in field, left empty.',
    run: () => messageFor(LoginSchema, { identifier: '', password: 'x' }, 'identifier'),
  },
  {
    name: 'loginPasswordRequired',
    why: 'Sign-in password, left empty. Note there is NO minimum length on sign-in — see the schema.',
    run: () => messageFor(LoginSchema, { identifier: 'x', password: '' }, 'password'),
  },
  {
    name: 'registerNameRequired',
    why: 'Full name under 2 characters.',
    run: () =>
      messageFor(
        RegisterSchema,
        { name: 'a', phone: '01012345678', password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD },
        'name',
      ),
  },
  {
    name: 'registerNameTooLong',
    why: 'Full name over 120 characters.',
    run: () =>
      messageFor(
        RegisterSchema,
        {
          name: 'a'.repeat(121),
          phone: '01012345678',
          password: VALID_PASSWORD,
          confirmPassword: VALID_PASSWORD,
        },
        'name',
      ),
  },
  {
    name: 'registerPhoneRequired',
    why: 'Phone left empty. The account identity — see EgyptianPhone.',
    run: () =>
      messageFor(
        RegisterSchema,
        { name: 'اسم كامل', phone: '', password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD },
        'phone',
      ),
  },
  {
    name: 'registerPhoneInvalid',
    why: 'Phone that is not a valid Egyptian number. Same constant as EgyptianPhone.invalidMessage.',
    run: () =>
      messageFor(
        RegisterSchema,
        {
          name: 'اسم كامل',
          phone: '+15551234567',
          password: VALID_PASSWORD,
          confirmPassword: VALID_PASSWORD,
        },
        'phone',
      ),
  },
  {
    name: 'registerEmailInvalid',
    why: 'A non-empty but malformed optional email. Blank is ACCEPTED — the field is optional.',
    run: () =>
      messageFor(
        RegisterSchema,
        {
          name: 'اسم كامل',
          phone: '01012345678',
          email: 'not-an-email',
          password: VALID_PASSWORD,
          confirmPassword: VALID_PASSWORD,
        },
        'email',
      ),
  },
  {
    name: 'registerPasswordTooShort',
    why: 'Under MIN_PASSWORD_LENGTH (8), which is better-auth’s own default.',
    run: () =>
      messageFor(
        RegisterSchema,
        { name: 'اسم كامل', phone: '01012345678', password: 'short', confirmPassword: 'short' },
        'password',
      ),
  },
  {
    name: 'registerPasswordTooLong',
    why: 'Over MAX_PASSWORD_LENGTH (128).',
    run: () =>
      messageFor(
        RegisterSchema,
        {
          name: 'اسم كامل',
          phone: '01012345678',
          password: 'a'.repeat(129),
          confirmPassword: 'a'.repeat(129),
        },
        'password',
      ),
  },
  {
    name: 'registerConfirmRequired',
    why: 'Confirm-password left empty.',
    run: () =>
      messageFor(
        RegisterSchema,
        { name: 'اسم كامل', phone: '01012345678', password: VALID_PASSWORD, confirmPassword: '' },
        'confirmPassword',
      ),
  },
  {
    name: 'registerConfirmMismatch',
    why: 'The two passwords differ. Attached to confirmPassword by a superRefine, not to password.',
    run: () =>
      messageFor(
        RegisterSchema,
        {
          name: 'اسم كامل',
          phone: '01012345678',
          password: VALID_PASSWORD,
          confirmPassword: `${VALID_PASSWORD}x`,
        },
        'confirmPassword',
      ),
  },
];

const resolved: Array<{ name: string; why: string; message: string }> = [];
const unreachable: string[] = [];

for (const probe of PROBES) {
  const message = probe.run();
  if (message === null) {
    unreachable.push(probe.name);
    continue;
  }
  if (!ARABIC.test(message)) {
    // The rule still fires, but its message is zod's English default — which
    // means the schema lost its custom message. That is a web bug too, so it
    // fails the run rather than shipping English into the app.
    unreachable.push(`${probe.name} (English default: ${message})`);
    continue;
  }
  resolved.push({ name: probe.name, why: probe.why, message });
}

/**
 * The onboarding wizard's field messages, discovered rather than probed.
 *
 * Onboarding has a dozen fields whose rules change as the taxonomy grows, so
 * enumerating them by hand would go stale. One parse yields one issue per
 * failing field, keyed by its path, which is exactly the mapping the Flutter
 * form needs.
 *
 * ⚠️ EMPTY STRINGS, not `{}`. The first version parsed an empty object and got
 * zod's English type errors back — "Invalid input: expected string, received
 * undefined" — which looked like the schema was missing its Arabic messages.
 * It is not: `.min(2, 'الاسم الكامل مطلوب')` is a REFINEMENT, and a refinement
 * never runs on a value that failed the type check first. An untouched text
 * input submits `''`, not `undefined`, so `''` is what the web actually
 * validates and `''` is what has to be probed.
 *
 * The enum fields (`gender`, `schoolStream`) are the one real exception, and
 * they are NOT a gap. They carry no zod message because the web deliberately
 * ignores zod's for them and renders `copy.onboarding.genderError` /
 * `streamError` instead (`apps/web/components/onboarding/onboarding-form.tsx`
 * — the comment there says so). Those ARE in the copy table, so the Flutter
 * form reads them through `CopyKeys` like any other string. They are reported
 * at the end of the run so the omission stays visible.
 */
const ONBOARDING_PROBE = {
  fullName: '',
  gender: undefined,
  phone: '',
  governorateCode: '',
  schoolName: '',
  schoolStream: undefined,
  fatherPhone: '',
};

const onboardingResult = OnboardingSchema.safeParse(ONBOARDING_PROBE);
const onboardingEntries: Array<[string, string]> = [];
const englishDefaults: string[] = [];
if (!onboardingResult.success) {
  for (const issue of onboardingResult.error.issues) {
    const key = issue.path.map(String).join('.');
    if (!key || onboardingEntries.some(([k]) => k === key)) continue;

    // ⚠️ ONLY Arabic messages are emitted.
    //
    // A zod field with no custom message falls back to the library's English
    // default — "Invalid input: expected string, received undefined". Those
    // are developer text, and putting one in front of an Egyptian student is
    // worse than showing nothing: it reads as the app leaking its own
    // internals. The Flutter form falls back to its own Arabic "required"
    // line for any field not listed here, and the names are printed at the
    // end of the run so the gap is visible rather than silent.
    if (!ARABIC.test(issue.message)) {
      englishDefaults.push(`${key} — ${issue.message}`);
      continue;
    }
    onboardingEntries.push([key, issue.message]);
  }
}

const lines = resolved.map(
  ({ name, why, message }) => `  /// ${why}\n  static const String ${name} = ${JSON.stringify(message)};`,
);

const onboardingMap = onboardingEntries
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, message]) => `    ${JSON.stringify(key)}: ${JSON.stringify(message)},`)
  .join('\n');

const dart = `// GENERATED BY scripts/sync-mobile-validation.ts — DO NOT EDIT.
//
// These are not transcriptions. Each string below was produced by RUNNING the
// zod schema in packages/contracts against invalid input and reading the issue
// back, so it is byte-identical to what a student sees on the web.
//
// Run \`pnpm mobile:validation\` after changing any schema in
// packages/contracts/src/auth.ts or onboarding.ts.
//
// ignore_for_file: lines_longer_than_80_chars

/// Field-level validation messages, mirrored from the shared zod schemas.
///
/// ⚠️ These live in the SCHEMAS, not in the copy table, because a message and
/// the rule that produces it have to change together. That is why they are not
/// in [CopyKeys] and are not translated by easy_localization — there is no key
/// to look up.
abstract final class ValidationMessages {
${lines.join('\n\n')}

  /// The onboarding wizard, keyed by field path.
  ///
  /// Discovered by parsing an empty object rather than probed field by field:
  /// onboarding grows a field every time the taxonomy does, and a hand-written
  /// list would go stale silently.
  static const Map<String, String> onboarding = <String, String>{
${onboardingMap}
  };
}
`;

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, dart, 'utf8');

console.log(`✓ ${resolved.length} validation messages → ${path.relative(REPO, OUT)}`);
console.log(`✓ ${onboardingEntries.length} onboarding field messages`);

if (englishDefaults.length > 0) {
  console.log(
    `\nℹ ${englishDefaults.length} onboarding field(s) carry no zod message and were SKIPPED.\n` +
      `  This is expected for the enums: the web renders copy.onboarding.*Error for them\n` +
      `  instead, and the Flutter form must read the same CopyKeys entries:\n` +
      englishDefaults.map((n) => `   ${n}`).join('\n'),
  );
}

if (unreachable.length > 0) {
  console.error(
    `\n✗ ${unreachable.length} probe(s) produced NO message — the schema changed shape:\n` +
      unreachable.map((n) => `   ${n}`).join('\n'),
  );
  // A stale probe means the Flutter form is now showing a message the web does
  // not, which is exactly the drift this script exists to prevent. Fail loudly.
  process.exitCode = 1;
}
