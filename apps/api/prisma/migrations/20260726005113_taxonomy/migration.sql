-- CreateEnum
CREATE TYPE "Region" AS ENUM ('urban', 'lower', 'upper', 'frontier');

-- CreateEnum
CREATE TYPE "SubjectLevel" AS ENUM ('normal', 'advanced');

-- CreateTable
CREATE TABLE "governorates" (
    "code" CHAR(2) NOT NULL,
    "name_ar" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "governorates_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "education_systems" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "total_marks" INTEGER NOT NULL,
    "pass_percent" DECIMAL(5,2) NOT NULL,
    "allows_retakes" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "education_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "label_ar" TEXT NOT NULL,
    "badge_ar" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label_ar" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "min_year" INTEGER NOT NULL DEFAULT 2,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_faculties" (
    "id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "track_faculties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_groups" (
    "id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "label_ar" TEXT NOT NULL,
    "pick_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "elective_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_offerings" (
    "id" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "track_id" TEXT,
    "subject_id" TEXT NOT NULL,
    "counts_toward_total" BOOLEAN NOT NULL DEFAULT true,
    "level" "SubjectLevel",
    "elective_group_id" TEXT,
    "marks" INTEGER NOT NULL DEFAULT 100,
    "pass_percent_override" DECIMAL(5,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subject_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "governorates_slug_key" ON "governorates"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "education_systems_slug_key" ON "education_systems"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_system_id_year_key" ON "academic_years"("system_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_system_id_slug_key" ON "tracks"("system_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_slug_key" ON "subjects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "elective_groups_track_id_year_label_ar_key" ON "elective_groups"("track_id", "year", "label_ar");

-- CreateIndex
CREATE INDEX "subject_offerings_system_id_year_idx" ON "subject_offerings"("system_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "subject_offerings_system_id_year_track_id_subject_id_key" ON "subject_offerings"("system_id", "year", "track_id", "subject_id");

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "education_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "education_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_faculties" ADD CONSTRAINT "track_faculties_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "education_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_elective_group_id_fkey" FOREIGN KEY ("elective_group_id") REFERENCES "elective_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
