-- «خصم لكل نوع اشتراك» — a coupon whose amount depends on the plan bought.
--
-- ADD VALUE is append-only and cannot be used in the same transaction that
-- adds it, which is why this migration adds the value and does nothing else.
-- The columns and the CHECK that name it are the next migration.
ALTER TYPE "app"."coupon_kind" ADD VALUE IF NOT EXISTS 'per_plan';
