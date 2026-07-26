import { Module } from '@nestjs/common';
import { auth } from './auth.config';

/**
 * Injection token for the configured Better Auth instance. Task 2 mounts
 * the actual HTTP handler via `@thallesp/nestjs-better-auth`'s
 * `AuthModule.forRoot({ auth })`, which needs the plain `auth` export from
 * `./auth.config` directly (it's read synchronously at module-decoration
 * time, before Nest's DI container exists). This token exists so anything
 * *inside* the Nest graph — guards, the login-throttle hooks in Task 3,
 * services that need `auth.api.*` — can get the same singleton through
 * ordinary constructor injection instead of importing the module-level
 * singleton directly everywhere.
 */
export const BETTER_AUTH = Symbol('BETTER_AUTH');

@Module({
  providers: [{ provide: BETTER_AUTH, useValue: auth }],
  exports: [BETTER_AUTH],
})
export class AuthModule {}
