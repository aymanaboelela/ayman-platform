-- «أقدر أحدد بإيدي أزوّد الأجهزة اللي هيدخل بيها أكتر من ٢» — a per-account
-- device limit the instructor sets from the student's page.
--
-- The limit was one constant for everybody (`MAX_DEVICES_PER_ACCOUNT = 2` in
-- `auth/device-limit.ts`). A student who genuinely studies on a phone, a
-- tablet and a laptop had no way through it but deleting a device every time.
--
-- Additive, NULLABLE, no default: NULL means «the platform default», so every
-- existing account on every stack keeps exactly the limit it has now the
-- moment this runs, and nothing is backfilled. A number is an explicit
-- override, written only by `PUT /api/admin/students/:userId/device-limit`.
--
-- The CHECK is the same 1..10 range the contract enforces
-- (`DEVICE_LIMIT_FLOOR`/`DEVICE_LIMIT_CEILING` in `@ayman/contracts/device-limit`).
-- 0 is not «blocked» — a ban is how an account is shut, and a limit of 0 would
-- be a second, unaudited ban. Above 10 the limit stops meaning anything.
ALTER TABLE "app"."users"
  ADD COLUMN "max_devices" INTEGER;

ALTER TABLE "app"."users"
  ADD CONSTRAINT "users_max_devices_range"
  CHECK ("max_devices" IS NULL OR "max_devices" BETWEEN 1 AND 10);
