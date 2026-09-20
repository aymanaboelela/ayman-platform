import { z } from 'zod';
import { FEATURE_DECLARATIONS } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy/admin';

/**
 * What the sign button sends.
 *
 * Not in `packages/contracts` like `StoreSettingsSchema` and the rest, and
 * that is the difference that matters: every other admin form posts its body
 * to a Nest controller that validates it against the SAME schema, so the
 * schema has to be shared. This one never leaves the Next server — the action
 * signs locally and hands back a string — so there is no second validator to
 * agree with, and putting it in the contracts package would publish a shape
 * the API has no opinion about to every consumer of that package.
 *
 * It is still re-validated inside the action. A `'use server'` export is a
 * POST endpoint with a stable id; the client-side `zodResolver` is a
 * convenience for the person typing, never the gate.
 */

/** Same rule as `scripts/check-tenant-env.mjs` and `lib/control-plane.ts` —
 *  the `sub` has to equal the instructor's `TENANT_KEY` literally. */
const TENANT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;

/**
 * Two years, and the floor is a day.
 *
 * The ceiling is not a security boundary — a longer document would be just as
 * signed. It is there because an expiry is the ONLY thing that eventually
 * undoes a document on a stack Ayman cannot reach: if the instructor stops
 * paying and stops answering, the token running out is what closes the paid
 * features. A ten-year token quietly gives that up.
 */
const MAX_DAYS = 730;

export const SignRequestSchema = z.object({
  tenantKey: z.string().regex(TENANT_KEY_PATTERN, copy.admin.platforms.tenantHint),
  days: z.number().int().min(1).max(MAX_DAYS),
  /**
   * `z.record`, not `z.enum` over `FeatureKey`: the form renders one entry per
   * declaration, so a key that is not in the catalog cannot come from the
   * screen — and `signEntitlementsDocument` rebuilds the map from
   * `FEATURE_DECLARATIONS` anyway, dropping anything it does not recognise.
   * A strict enum here would only add a second place to edit when a feature is
   * added, and would turn a stale open tab into an error instead of a token.
   */
  features: z.record(z.string(), z.boolean()),
});

export type SignRequest = z.infer<typeof SignRequestSchema>;

/** A year. Long enough that renewing it is not a chore, short enough that a
 *  stack somebody stopped paying for does not stay open indefinitely. */
export const DEFAULT_DAYS = 365;

/**
 * The starting state of the nine checkboxes: exactly what an instructor's
 * stack already runs with no document at all (`tenantDefaults()`).
 *
 * So an untouched form signs a document that changes nothing: every tick is a
 * feature Ayman is adding and every untick is one he is taking away, and the
 * screen never has to explain which is which. The alternative — everything
 * off — would make a hurried save a deliberate-looking shutdown of all nine.
 */
export function defaultFeatureValues(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const declaration of FEATURE_DECLARATIONS) out[declaration.key] = declaration.defaultForTenant;
  return out;
}
