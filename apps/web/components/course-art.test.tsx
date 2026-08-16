import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CourseArt } from './course-art';

afterEach(() => {
  cleanup();
});

const COVER = 'ab/abcdef01-2345-6789-abcd-ef0123456789.webp';

/**
 * The rule this pins is one sentence: **an uploaded cover is never cropped and
 * never padded.**
 *
 * It has been wrong in three different ways. `cover` cropped it — 34% of the
 * height off the dashboard's 16/7 box, taking the top off «التأسيسي» in the
 * course's own title. `contain` padded it — a fifth of the card as bars, which
 * reads as an image that failed to load. What is left is no fit at all: full
 * width, natural height, the box sized by the picture.
 *
 * None of those three failures throws, logs, or turns a test red on its own —
 * they are silently ugly — so the shape is asserted directly here.
 */
describe('CourseArt', () => {
  it('renders an uploaded cover at its own height, with no fit applied', () => {
    const { container } = render(
      <CourseArt coverKey={COVER} subjectNameAr="البرمجة" seed="a-course" />
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveClass('course-art__photo');

    // `fill` is what the two rejected answers both needed: it injects
    // `position: absolute; inset: 0` and hands sizing to the parent box. Its
    // absence IS the fix, so it is asserted rather than assumed.
    expect(img?.style.position).not.toBe('absolute');
    // Next requires width/height for a remote image and uses them only to
    // reserve the box; the real ratio takes over because the height is auto.
    expect(img?.getAttribute('width')).toBe('1600');
    expect(img?.getAttribute('height')).toBe('900');
  });

  it('keeps cropping inside the 80px and 128px thumbnails', () => {
    // Nobody reads a title at that size, and a natural-height image there would
    // make a fixed-size slot's height vary per course and pull its flex row out
    // of alignment. So `compact` is the one place `cover` is still correct.
    const { container } = render(
      <CourseArt coverKey={COVER} subjectNameAr="البرمجة" seed="a-course" compact />
    );

    const img = container.querySelector('img');
    expect(img).toHaveClass('course-art__thumb');
    expect(img).not.toHaveClass('course-art__photo');
    // `fill` is correct here — the slot owns the box.
    expect(img?.style.position).toBe('absolute');
  });

  it('falls back to the generated scene when there is no cover', () => {
    // The fallback is a gradient panel with NO intrinsic height, which is why
    // the call sites keep their aspect box for this branch — without one it
    // collapses to nothing.
    const { container } = render(
      <CourseArt coverKey={null} subjectNameAr="البرمجة" seed="a-course" />
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg.course-art__shapes')).not.toBeNull();
  });

  it('hides the art from assistive tech on every branch', () => {
    // Every call site prints the course title as text beside it, so announcing
    // the art would say the same thing twice.
    for (const key of [COVER, null]) {
      const { container } = render(
        <CourseArt coverKey={key} subjectNameAr="البرمجة" seed="a-course" />
      );
      expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
      cleanup();
    }
  });
});
