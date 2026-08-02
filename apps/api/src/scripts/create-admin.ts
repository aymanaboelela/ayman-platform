/**
 * Provisions the FIRST admin account on a real deployment.
 *
 * This exists because `seed-admin.ts` cannot do it and must not be made to:
 * that script refuses to run when `NODE_ENV=production` (deliberately — it
 * would otherwise create an admin with a guessable default outside a test
 * environment), and it also seeds a demo course, a demo lesson and a demo
 * quiz that have no business in a production catalogue. Loosening its guard
 * would have dragged all of that in with it.
 *
 * What this does, and nothing else:
 *   1. Upserts one `User` with `role: 'admin'`.
 *   2. Upserts its `credential` account with an Argon2id hash built from the
 *      SAME `ARGON2_OPTIONS` the login path verifies against — a hash at
 *      different cost parameters simply fails to verify, so importing the
 *      shared constant is load-bearing, not tidiness.
 *   3. Upserts a `StudentProfile` with `onboardingCompletedAt` set.
 *
 * Step 3 is not optional. `apps/web/proxy.ts`'s redirect matrix sends any
 * authenticated-but-not-onboarded session to `/onboarding` on EVERY protected
 * route, `/admin` included — without a completed profile the new admin can log
 * in and then cannot reach the dashboard at all.
 *
 * ⚠️ It lives under `src/`, not next to `seed-admin.ts` in `prisma/`, for one
 * concrete reason: only `src/**` is compiled (`tsconfig.json`'s `include`), and
 * only `dist/` ships in the runtime image. A `.ts` file in `prisma/` would
 * reach the container but could not run there — `src/` is absent from the
 * image, so its `../src/generated/prisma/client` import resolves to nothing.
 * As compiled CommonJS in `dist/scripts/`, every import resolves normally:
 *
 *   docker exec -e ADMIN_EMAIL=… -e ADMIN_PASSWORD=… -w /app/apps/api \
 *     <api-container> node dist/scripts/create-admin.js
 *
 * Idempotent: re-running RESETS the password of an existing account, which is
 * also how you recover a locked-out admin.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { ARGON2_OPTIONS } from '../auth/argon2-options';
import { PrismaClient } from '../generated/prisma/client';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || 'أيمن أبو العلا';

if (!email || !password) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must both be set.');
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  throw new Error(`ADMIN_EMAIL is not an email address: ${email}`);
}
/**
 * A floor, not a policy. This account can publish courses, read every
 * student's record and grant access — it is the single highest-value
 * credential on the platform, and the one most likely to be created in a
 * hurry from a shell. 12 characters is the minimum that makes an offline
 * attack against the Argon2id hash unattractive.
 */
if (password.length < 12) {
  throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const passwordHash = await hash(password!, ARGON2_OPTIONS);

  const user = await prisma.user.upsert({
    where: { email: email! },
    // `role: 'admin'` on update too — this doubles as "promote this existing
    // account", which is the other reason to reach for this script.
    update: { role: 'admin', emailVerified: true },
    create: {
      id: randomUUID(),
      email: email!,
      name,
      role: 'admin',
      // No mail is configured on this deployment, so an unverified admin
      // could never complete a verification round trip and would be locked
      // out of its own platform.
      emailVerified: true,
    },
  });

  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: 'credential', accountId: user.id } },
    update: { password: passwordHash },
    create: {
      id: randomUUID(),
      providerId: 'credential',
      accountId: user.id,
      userId: user.id,
      password: passwordHash,
    },
  });

  // See the header: without this the proxy bounces every /admin request to
  // /onboarding. `findFirst`, not `findFirstOrThrow`, so a database whose
  // governorate table has not been seeded yet produces a clear message rather
  // than a Prisma stack trace.
  const governorate = await prisma.governorate.findFirst();
  if (!governorate) {
    throw new Error(
      'No governorates in the database — run the taxonomy seed before creating an admin.',
    );
  }

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: { onboardingCompletedAt: new Date() },
    create: {
      userId: user.id,
      fullName: name,
      gender: 'male',
      phone: '01000000000',
      governorateCode: governorate.code,
      onboardingCompletedAt: new Date(),
    },
  });

  // The password is NEVER echoed — this runs in a shell whose history and
  // whose container logs both outlive the session.
  console.log(`admin ready: ${email} (role=admin, onboarding complete)`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
