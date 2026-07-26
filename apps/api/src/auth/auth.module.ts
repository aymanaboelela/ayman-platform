import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
// `@thallesp/nestjs-better-auth` exports its own class named `AuthModule` —
// the exact same name this file's own export uses. Aliased here, at the one
// place both are imported together, per Task 1's flag.
import { AuthModule as BetterAuthHttpModule } from '@thallesp/nestjs-better-auth';
import { auth } from './auth.config';
import { BETTER_AUTH } from './better-auth.token';
import { AuthGuard } from './guards/auth.guard';
import { SessionController } from './session.controller';

@Module({
  controllers: [SessionController],
  imports: [
    // Mounts the Better Auth HTTP handler (POST /api/auth/sign-up/email etc.)
    // as raw middleware at `auth.options.basePath` ('/api/auth', configured
    // in `./auth.config`), ahead of Nest's router — and, since `bodyParser:
    // false` is set in `main.ts`, this module also installs the JSON/
    // urlencoded body parsers for every *other* route, because Better Auth's
    // own routes need the untouched raw body.
    //
    // `disableGlobalAuthGuard: true`: this package ships its own `AuthGuard`
    // (role-equality-based `@Roles()`/`@Public()`), which is NOT what Plan 2
    // requires (permission-string checks, deny-by-default, fail-closed on a
    // throwing session lookup). Our own `AuthGuard` below is the sole
    // authorization authority instead (Global Constraint #8).
    BetterAuthHttpModule.forRoot({
      auth,
      disableGlobalAuthGuard: true,
    }),
  ],
  providers: [
    { provide: BETTER_AUTH, useValue: auth },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [BETTER_AUTH],
})
export class AuthModule {}
