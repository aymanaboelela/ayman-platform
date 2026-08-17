-- The email becomes genuinely optional.
--
-- `20260816180000_user_phone_number` made the phone the account identifier but
-- left this column NOT NULL, because Better Auth's core table declares
-- `email` as `required: true`. The workaround at the time was a synthesised
-- `<digits>@phone.invalid` address per phone-only account. That worked, but it
-- put a value in the database that was never true — every surface then had to
-- remember to hide it, and the delete-confirmation had to be taught that the
-- address it was showing an admin was fake.
--
-- The override turned out to be available after all: `getAuthTables` spreads
-- `options.user.additionalFields` AFTER its own field block, so re-declaring
-- `email` as `required: false` there replaces the core definition outright.
-- See `auth.config.ts` for the second half (the `/sign-up/email` route
-- validator, which is separate and cannot be disabled).

ALTER TABLE "app"."users" ALTER COLUMN "email" DROP NOT NULL;

-- Convert the placeholders that were minted while the column was NOT NULL.
--
-- These are real rows: the phone-first sign-up shipped and ran in production
-- before this migration, so any student who registered without an email in
-- that window has one of these. Left behind they would be indistinguishable
-- from a real address to every consumer that no longer calls
-- `isPlaceholderEmail` — which, after this change, is all of them.
--
-- The `@phone.invalid` suffix is the exact string `placeholderEmailForPhone`
-- produced, on a TLD RFC 2606 reserves as permanently unresolvable, so this
-- pattern cannot match an address a human actually owns.
UPDATE "app"."users"
SET "email" = NULL
WHERE "email" LIKE '%@phone.invalid';

-- `users_email_key` is deliberately LEFT IN PLACE. Postgres exempts NULLs from
-- a unique index, so it keeps preventing two accounts from sharing a real
-- address while allowing any number of email-less ones. Uniqueness for those
-- is carried by `users_phone_number_key`.
