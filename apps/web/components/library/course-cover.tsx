import { CourseArt } from '@/components/course-art';

/**
 * The course's art, at the size it deserves.
 *
 * The signed-in course page shipped without it entirely — the public page
 * showed the cover and the page a student actually studies from showed a
 * heading and a grey list. That absence is most of why the screen read as
 * black and white: on a catalog card the art is the only colour in the tile,
 * and here there was no tile.
 *
 * All this component now owns is the BOX — a 16/10 aspect ratio, the radius and
 * the hairline that keep it sitting properly on the stage band behind it. What
 * goes inside is `<CourseArt>`, which is the same object the library card and
 * the dashboard card render; three copies of "cover, or else a fallback" is
 * three places for the fallback to be wrong, and it was: this one drew its
 * glyph in `text-accent-text` while the library's drew the same glyph in ember,
 * so one course had two different marks depending on which screen you found it
 * on.
 */
export function CourseCover({
  coverKey,
  subjectNameAr,
  seed,
}: {
  coverKey: string | null;
  subjectNameAr: string;
  seed: string;
}) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--r-md)] ring-1 ring-white/15">
      <CourseArt coverKey={coverKey} subjectNameAr={subjectNameAr} seed={seed} />
    </div>
  );
}
