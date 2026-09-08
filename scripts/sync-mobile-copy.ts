/**
 * Generates the Flutter app's translation bundles from `@ayman/contracts/copy`.
 *
 * ## Why this exists rather than a hand-written ar.json
 *
 * Every Arabic string the product says lives in `packages/contracts/src/copy/`
 * and is written with a very specific voice — first person plural, «نحاول
 * تاني» never «حاول تاني», never gendered, never promising a delivery date.
 * The moment the mobile app keeps its own copy of those strings, the two
 * surfaces start answering the same question with different words, and nobody
 * notices until a student is reading one on a phone and the other on a laptop.
 *
 * So the app does not keep its own copy. It keeps a GENERATED one, and this
 * script is the only thing allowed to write it. `pnpm mobile:copy` regenerates;
 * CI runs the same command and fails if the working tree changes, which is what
 * makes "edit ar.ts, forget the app" impossible.
 *
 * ## What it emits
 *
 *   apps/mobile/assets/translations/ar.json   — the whole flattened string table
 *   apps/mobile/assets/translations/en.json   — the SAME KEYS, English where a
 *                                               translation exists, otherwise
 *                                               the Arabic value as a
 *                                               placeholder
 *   apps/mobile/lib/core/localization/copy_keys.dart — a const class of every
 *                                               key, so a typo is a compile
 *                                               error rather than a string that
 *                                               renders as its own key
 *
 * ## Flattening
 *
 * `copy.auth.login.title` becomes `"auth.login.title"`, which is exactly the
 * dotted path `easy_localization` looks up. Arrays are flattened by index
 * (`faq.items.0.q`) because easy_localization has no array accessor and the
 * alternative — emitting JSON arrays and reading them with `tr()` — silently
 * returns the key.
 *
 * ⚠️ A value that is a FUNCTION is skipped, not stringified. Several entries in
 * `ar.ts` are template builders (`(n) => \`${n} درس\``); those have to be
 * reimplemented in Dart with the same plural rules, and emitting
 * `"(n) => ..."` as a translation would ship JavaScript source into the UI.
 * They are listed at the end of the run so none is forgotten.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// ⚠️ `copy/admin.ts` exports the WHOLE table — `{ ...student, admin, adminNews,
// quizAdmin, analytics, marketing }` — not just the admin half. The split
// exists so a student's JS bundle never downloads 28 KB of admin strings it
// cannot use; a Flutter app ships one binary and has no such split to make, so
// it takes the superset and skips the student-only import entirely.
//
// (An earlier revision imported a non-existent `adminCopy` from this module.
// TypeScript's `verbatimModuleSyntax` did not object at runtime, `flatten`
// returned early on `undefined`, and the run reported success with every admin
// key silently missing. Hence the assertion below.)
import { copy } from '../packages/contracts/src/copy/admin.ts';
import { copy as studentCopy } from '../packages/contracts/src/copy/ar.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MOBILE = resolve(REPO, 'apps/mobile');

type Flat = Record<string, string>;

const skippedFunctions: string[] = [];

function flatten(value: unknown, prefix: string, out: Flat): void {
  if (typeof value === 'function') {
    skippedFunctions.push(prefix);
    return;
  }
  if (typeof value === 'string') {
    out[prefix] = value;
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    out[prefix] = String(value);
    return;
  }
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}.${index}`, out));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
}

const ar: Flat = {};
flatten(copy, '', ar);

// The superset must actually BE a superset. If `copy/admin.ts` ever stops
// spreading the student table, this fails loudly instead of shipping an app
// whose student screens all render their own key names.
const studentOnly: Flat = {};
flatten(studentCopy, '', studentOnly);
const missing = Object.keys(studentOnly).filter((key) => !(key in ar));
if (missing.length > 0) {
  throw new Error(
    `copy/admin.ts no longer contains the whole student table — ${missing.length} keys ` +
      `are missing, starting with: ${missing.slice(0, 5).join(', ')}`,
  );
}

// A guard against the inverse mistake: a run that produced only the student
// table would look successful and quietly ship an admin app with no words in
// it.
if (!Object.keys(ar).some((key) => key.startsWith('admin.'))) {
  throw new Error('no `admin.*` keys were emitted — check the copy/admin.ts export');
}

/**
 * The English bundle.
 *
 * The switch is BUILT but deliberately NOT ENABLED (`LocaleCubit` refuses to
 * leave Arabic; see its note), so this file exists to keep the structure
 * honest rather than to be read by a student today. Every key is present with
 * the Arabic value as its placeholder, so that turning English on later is a
 * translation job and not a "which keys are missing" archaeology job.
 *
 * Any key already translated in `en-overrides.json` wins — that file is
 * hand-maintained and this script never overwrites it.
 */
const overridesPath = resolve(MOBILE, 'assets/translations/en-overrides.json');
let overrides: Flat = {};
try {
  overrides = JSON.parse(readFileSync(overridesPath, 'utf8')) as Flat;
} catch {
  // Absent on a fresh checkout, which is fine: no overrides yet.
}

const en: Flat = {};
for (const [key, value] of Object.entries(ar)) {
  en[key] = overrides[key] ?? value;
}

const orphanOverrides = Object.keys(overrides).filter((key) => !(key in ar));

function writeJson(path: string, data: Flat): void {
  mkdirSync(dirname(path), { recursive: true });
  // Sorted so a regeneration produces a reviewable diff instead of a reshuffle.
  const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

writeJson(resolve(MOBILE, 'assets/translations/ar.json'), ar);
writeJson(resolve(MOBILE, 'assets/translations/en.json'), en);

/**
 * `CopyKeys.authLoginTitle` instead of `'auth.login.title'`.
 *
 * A misspelled dotted string does not throw in easy_localization — it renders
 * the key itself, so «auth.login.titel» ships to a student as literal Latin
 * text on an Arabic screen. A generated const makes the same mistake a
 * compile error.
 */
function dartIdentifier(key: string): string {
  const parts = key.split(/[.\-_]/).filter(Boolean);
  const head = parts[0].replace(/[^a-zA-Z0-9]/g, '');
  const tail = parts
    .slice(1)
    .map((part) => {
      const clean = part.replace(/[^a-zA-Z0-9]/g, '');
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    })
    .join('');
  const raw = `${head.charAt(0).toLowerCase()}${head.slice(1)}${tail}`;
  // A key whose first segment is numeric ("0.q") would produce an identifier
  // starting with a digit.
  return /^[a-zA-Z_]/.test(raw) ? raw : `k${raw}`;
}

const seen = new Map<string, string>();
const fields: string[] = [];
for (const key of Object.keys(ar).sort()) {
  let name = dartIdentifier(key);
  if (seen.has(name)) {
    // Two different dotted paths can normalise to the same identifier
    // ("a.bC" and "a.b.c"). Disambiguate rather than silently dropping one.
    let n = 2;
    while (seen.has(`${name}$${n}`)) n += 1;
    name = `${name}$${n}`;
  }
  seen.set(name, key);
  fields.push(`  static const String ${name} = ${JSON.stringify(key)};`);
}

const dart = `// GENERATED BY scripts/sync-mobile-copy.ts — DO NOT EDIT.
//
// Every Arabic string in the product is authored once, in
// packages/contracts/src/copy/. Run \`pnpm mobile:copy\` after changing it.
//
// ignore_for_file: lines_longer_than_80_chars, constant_identifier_names

/// Every translation key that exists, as a compile-time constant.
///
/// \`tr(CopyKeys.authLoginTitle)\` rather than \`tr('auth.login.title')\`: a
/// misspelled dotted string does not throw in easy_localization, it renders
/// the key itself — which ships literal Latin text onto an Arabic screen.
abstract final class CopyKeys {
${fields.join('\n')}
}
`;

mkdirSync(resolve(MOBILE, 'lib/core/localization'), { recursive: true });
writeFileSync(resolve(MOBILE, 'lib/core/localization/copy_keys.dart'), dart, 'utf8');

console.log(`✓ ${Object.keys(ar).length} keys → assets/translations/{ar,en}.json`);
console.log(`✓ ${fields.length} constants → lib/core/localization/copy_keys.dart`);

if (skippedFunctions.length > 0) {
  console.log(
    `\n⚠ ${skippedFunctions.length} template builders were skipped — reimplement each in Dart:`,
  );
  for (const key of skippedFunctions) console.log(`   ${key}`);
}

if (orphanOverrides.length > 0) {
  console.log(`\n⚠ ${orphanOverrides.length} English overrides no longer have an Arabic key:`);
  for (const key of orphanOverrides) console.log(`   ${key}`);
}
