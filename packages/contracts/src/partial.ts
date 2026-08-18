import { z } from '@ayman/contracts/zod';

/**
 * `.partial()`, but WITHOUT the create-time defaults.
 *
 * `z.object(shape).partial()` makes every key optional and leaves each key's
 * `.default()` in place — and Zod applies a default whenever the key is absent.
 * So a schema built for both create and update parsed `{ title }` into a full
 * object with every other field defaulted, and the service wrote all of it.
 *
 * That is a PATCH that overwrites what it was not asked to touch. On production
 * (2026-08-17) renaming a published lecture unpublished it, because the admin's
 * rename sends exactly `{ title }` and `isPublished` defaults to `false`. The
 * quieter half: publishing a lecture sends only `{ isPublished }`, which reset
 * its completion rule and its `forGeneral`/`forLanguages` targeting — both
 * default to `true`, so a «عام»-only lecture silently became visible to لغات.
 *
 * Unwrapping is the right repair rather than stripping keys after parse: a
 * caller that explicitly sends `isPublished: false` means it, and any
 * "drop what equals the default" filter would throw that away too.
 *
 * `ZodDefault` only — `ZodOptional`, `ZodNullable` and `.catch()` are left
 * alone. Nullability is part of the field's type; a default is a create-time
 * convenience, and it is the only thing that manufactures a value out of an
 * absent key.
 *
 * ## Why this is its own module and not a second export of `./zod`
 *
 * It lived in `zod.ts` for about ten minutes of production time and took the
 * admin course page down with it. `zod.ts` compiles to a client module whose
 * only export, `z`, is a re-export Turbopack forwards straight through to the
 * `zod` package — so the module's compiled export table was literally
 * `e.s([])`, empty, and Turbopack derives its module id from the FILE PATH, so
 * that id is the same number in every build. Turbopack's client runtime keeps
 * the FIRST factory registered for an id and silently discards every later
 * one:
 *
 *     for (…) { const existing = factories.get(id); if (existing) { … break } }
 *     …
 *     if (!factories.has(id)) factories.set(id, chosen)
 *
 * A browser that still held any chunk from the previous build therefore had
 * that id pinned to the export-less factory. When the new build's chunk for
 * `content.ts` evaluated, `esmImport` handed it that module's sealed, empty
 * exports object and the module-scope call threw
 * `(0 , t.partialWithoutDefaults) is not a function` — reproduced exactly, in
 * a browser, against a build of the deployed commit.
 *
 * The rule that follows, and the reason this file exists: adding an export to
 * an EXISTING module is only safe once every client has reloaded, because the
 * id is stable and the old registration wins. Adding a NEW module is always
 * safe — no client can already hold an id derived from a path that did not
 * exist. `zod.ts` must stay export-free; `zod-exports-only-z.spec.ts` holds it
 * there.
 */
export function partialWithoutDefaults<Shape extends z.ZodRawShape>(
  shape: Shape,
): { [K in keyof Shape]: z.ZodOptional<Shape[K]> } {
  const entries = Object.entries(shape).map(([key, schema]) => {
    const unwrapped = schema instanceof z.ZodDefault ? schema.def.innerType : schema;
    return [key, z.optional(unwrapped as z.ZodType)];
  });
  return Object.fromEntries(entries) as { [K in keyof Shape]: z.ZodOptional<Shape[K]> };
}
