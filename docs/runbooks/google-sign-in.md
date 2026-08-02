# Google sign-in — "كمّل بحساب جوجل"

Everything in the codebase is already wired. What is **not** done is the part that
can only happen in a browser against Google's own console: creating the OAuth client
and pasting its two values into the environment. Until that happens the button
renders and 400s, because Better Auth only registers the `google` provider when both
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present
(`apps/api/src/auth/auth.config.ts`).

**Status: NOT YET DONE as of 2026-08-03.** No Google OAuth client exists.

Apple was removed from the UI on the same date. The API-side Apple wiring is still in
`auth.config.ts` but is inert (it registers only when all four `APPLE_*` vars are
set, and they are not) — bringing that button back is a web-only change.

---

## The one value that has to match exactly

Google rejects the callback if the redirect URI differs from the registered one by
even a trailing slash. The URI is derived, not chosen:

```
<BETTER_AUTH_URL> + /api/auth/callback/google
```

`BETTER_AUTH_URL` is Better Auth's own `baseURL`, and `basePath` is `/api/auth`.
So for this repo:

| Environment | `BETTER_AUTH_URL` | Authorized redirect URI |
|---|---|---|
| Local dev | `http://localhost:3300` | `http://localhost:3300/api/auth/callback/google` |
| Production | `https://aymanaboelela.com` | `https://aymanaboelela.com/api/auth/callback/google` |

Two traps worth stating outright:

- **Local dev uses port 3300, not 3200.** 3200 is the Next.js app; 3300 is the API,
  and in local `apps/api/.env` `BETTER_AUTH_URL` points at the API directly. The
  browser's *first* hop goes through the web app, but Google's callback is aimed at
  whatever `BETTER_AUTH_URL` says.
- **In production both are the same origin,** because `docker-compose.yml` sets
  `BETTER_AUTH_URL: ${APP_URL}`. That works because `apps/web/next.config.ts`
  rewrites `/api/:path*` to the API server-side, so `https://aymanaboelela.com/api/auth/...`
  reaches the API without the browser ever seeing the API's own origin.

Register **both** URIs on the same OAuth client. Google allows many, and one client
for dev + prod is fine here.

---

## 1. Create the OAuth client

1. <https://console.cloud.google.com/> → create a project (or pick the existing one).
2. **APIs & Services → OAuth consent screen.**
   - User type: **External**.
   - App name, support email, developer contact — required, shown to users.
   - Scopes: leave the defaults. Better Auth requests `openid email profile`; none of
     those are sensitive or restricted, so **no Google verification review is
     needed** and the app can stay in "Testing" or be published immediately.
   - While the app is in **Testing**, only accounts listed under **Test users** can
     sign in — everyone else gets `access_blocked`. Click **Publish app** before
     real students try it.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
   - Application type: **Web application**.
   - **Authorized redirect URIs**: add both rows from the table above.
   - Authorized JavaScript origins: leave empty. This is a server-side
     (authorization-code) flow — Better Auth never runs Google's JS SDK.
4. Copy the **Client ID** and **Client secret**. The secret is shown once.

No API needs to be enabled — sign-in works off the OAuth client alone.

---

## 2. Local development

Uncomment and fill both lines in `apps/api/.env`:

```
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="...."
```

Both together, always. A lone id (or a lone secret) fails env validation at boot on
purpose — a half-configured provider that only fails at request time is worse than
one that refuses to start. Restart the API; nothing is hot-reloaded here, because
`auth.config.ts` reads env at module load.

## 3. Production

This deployment runs on Dokploy, so the two keys go in the Compose app's
**Environment** tab — the same place every other secret lives.
`deploy/.env.dokploy.example` is the copy-paste template for that tab;
`deploy/.env.production.example` documents the same keys for a bare-VPS/systemd
install. Set them, then redeploy.

`docker-compose.yml` must also *forward* them into the container — it now does:

```yaml
GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
```

This is not optional boilerplate. Compose reads the `.env` file only for `${...}`
substitution; a variable that exists there but is **not** listed under `environment:`
never enters the container. That exact omission is what silently broke the admin
bootstrap before (commit `c739644`) — the value was set, and the process simply
never saw it.

The `:-` default makes the variable an **empty string** when unset, which is why
`apps/api/src/config/env.ts` normalises `""` to "absent" before validating. Without
that, leaving Google unconfigured would crash the whole API at boot.

---

## 4. Verify

1. Open `/login`, press **كمّل بحساب جوجل**.
2. You should land on `accounts.google.com`, not an error page. If the API 400s
   instead, the provider was never registered — the env vars aren't reaching the
   process.
3. Pick an account. You should return to `/onboarding` with a session cookie set.
4. `Error 400: redirect_uri_mismatch` on Google's own page means the registered URI
   and the derived one differ. Google prints the URI it received — compare it
   character for character against the table above.
5. `Error 403: access_blocked` means the consent screen is still in Testing and the
   account isn't a listed test user.

A brand-new Google account lands on `/onboarding`, same as an email/password
registration, because onboarding is never complete for a new user.

### Two settings that look wrong and are not — do not "fix" them

**1. The session cookie is `SameSite=Lax`, not `Strict`.** The plan's S8 asked for
`Strict`; that was amended on 2026-08-03 because `Strict` silently breaks this exact
flow. Google's callback is a cross-site redirect, and a browser withholds `Strict`
cookies for the *whole* redirect chain — not just its first hop. So the session
cookie would be set on the callback response, the callback would 302 to
`/onboarding`, and the browser would decline to send the cookie it had just stored:
a user who authenticated successfully gets bounced back to `/login`. Email/password
never showed this, because that path is a same-site `fetch`.

Tightening it back to `Strict` will reintroduce a login loop that only appears in
production. CSRF does not depend on it — see the S8 amendment note in
`docs/superpowers/plans/2026-07-26-plan-2-auth-onboarding.md`.

**2. `advanced.useSecureCookies` is `false` even in production.** That flag controls
the automatic `__Secure-` *name prefix*, which is disabled on purpose so the
`__Host-` prefix can be applied by hand. Better Auth unfortunately derives every
cookie's `secure` *attribute* from the same flag, so
`advanced.defaultCookieAttributes` restores `Secure` in production for the cookies
that don't set it themselves — including the signed OAuth `state` cookie. Removing
that block ships auth cookies without `Secure` on an HTTPS site.

### One thing that is deliberately NOT permissive

An existing local (email/password) account is **not** auto-linked to a Google account
just because the email matches, unless Google reports `email_verified: true`.
`accountLinking.trustedProviders` is set to `[]` explicitly in `auth.config.ts` — so
Google is never exempted from that check. This is the S7 requirement; don't "fix" a
surprising non-link by adding `'google'` to that array.
