import { SetMetadata } from '@nestjs/common';

export const ALLOW_AGENT_TOKEN_KEY = 'allowAgentToken';
export const NO_AGENT_TOKEN_KEY = 'noAgentToken';

/**
 * Lets an agent key (`ayk_…`) reach a route that carries no
 * `@RequirePermission`.
 *
 * A key is deny-by-default on such routes. "Signed in, any permission" routes
 * are the student's own surface — profile, sessions, their own homework — and
 * a key acting as a staff account has no business there. A key gets in only
 * where a permission it carries says so, or where this marker does.
 */
export const AllowAgentToken = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_AGENT_TOKEN_KEY, true);

/**
 * Refuses an agent key outright, whatever it carries — for the routes that
 * manage keys. A key that can mint keys is one revoking it does not stop.
 */
export const NoAgentToken = (): MethodDecorator & ClassDecorator =>
  SetMetadata(NO_AGENT_TOKEN_KEY, true);
