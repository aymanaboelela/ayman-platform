-- How a course releases its lessons.
--
-- `sequential` is the default because it is the product's actual model: a
-- lesson opens only when the one before it is cleared, and a lesson carrying a
-- quiz is cleared only by passing it. `open` exists for revision courses, where
-- marching a student through the material in order would be wrong.
CREATE TYPE "app"."progression_mode" AS ENUM ('open', 'sequential');

-- Existing courses adopt `sequential`. That is a deliberate behaviour change,
-- and it is safe HERE specifically: the platform has not launched, so no
-- student is mid-course and nobody can be locked out of content they had
-- already reached. An admin can opt any individual course back out.
ALTER TABLE "app"."courses"
  ADD COLUMN "progression_mode" "app"."progression_mode" NOT NULL DEFAULT 'sequential';
