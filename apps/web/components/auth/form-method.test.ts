import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No `<form onSubmit>` anywhere may omit `method`.
 *
 * ## The leak
 *
 * A form with no `method` submits as **GET**. The markup is in the SSR'd HTML
 * long before React attaches `onSubmit`, so a press inside that window is
 * handled by the BROWSER: it reloads the page with every field in the query
 * string. On the login form that is
 * `/login?email=…&password=…` — the password in plain text in the URL, and
 * from there in the student's history, in the `Referer` of the next request,
 * and in every access log between them and the origin.
 *
 * It is not a theoretical window. It was hit on production while signing in
 * with a real browser, which pressed the button the instant it was visible —
 * which is what a fast finger on a slow phone does, and slow phones are most
 * of this platform's traffic.
 *
 * `method="post"` puts the fields in the request body instead. After hydration
 * `handleSubmit` calls `preventDefault()` and no native submit ever happens, so
 * the attribute costs nothing on the path everyone actually takes.
 *
 * ## Why a source scan rather than a render test
 *
 * The bug is a MISSING attribute, and the set of forms is open — the next form
 * anyone writes is exactly the one at risk. Rendering each of them would test
 * the components that exist today; reading the source tests the rule.
 */
const ROOTS = ['components', 'app'];
const SOURCE = /\.tsx$/;

/**
 * Comments out, then scan.
 *
 * The first version matched its own docblock: `onboarding-form.tsx` explains
 * the rule and quotes the very pattern it is describing, so the test reported
 * the file it had just fixed. A scanner that cannot tell code from prose is a
 * scanner that punishes anyone who documents the rule — which is the opposite
 * of what this is for.
 *
 * Block comments go wholesale; for line comments only whole comment LINES are
 * dropped, so a `'https://…'` inside a string cannot take the rest of its line
 * with it.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === 'node_modules' || entry === '.next') return [];
    if (statSync(path).isDirectory()) return walk(path);
    return SOURCE.test(entry) ? [path] : [];
  });
}

describe('every form states its method', () => {
  it('has no `<form onSubmit>` without `method`, anywhere', () => {
    const offenders = ROOTS.flatMap(walk).filter((file) =>
      // `\s+` spans NEWLINES, and that is the point: `onboarding-form.tsx`
      // puts its attributes one per line, so a hand-grep for the single-line
      // spelling missed the form carrying the student's phone number. A
      // `<form method="post" onSubmit=` passes, and so does `<form action={…}>`,
      // which never navigates.
      /<form\s+onSubmit/.test(code(readFileSync(file, 'utf8'))),
    );

    expect(offenders, `these submit as GET before React hydrates:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });

  it('keeps the guard on the two forms that carry credentials', () => {
    for (const file of ['components/auth/login-form.tsx', 'components/auth/register-form.tsx']) {
      const source = code(readFileSync(file, 'utf8'));
      expect(source, `${file} must post`).toMatch(/<form\s+method="post"/);
    }
  });
});
