import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HomeworkImage } from './homework-image';

afterEach(() => {
  cleanup();
});

const SRC = '/api/admin/homework/images/0190aaaa-0000-7000-8000-000000000001';

function renderImage() {
  const { container } = render(<HomeworkImage src={SRC} alt="صورة 1" eager rotateLabel="لفّ الصورة" />);
  const img = container.querySelector('img')!;
  const frame = img.parentElement!;
  // A phone shot of a page, stored landscape.
  Object.defineProperty(img, 'naturalWidth', { value: 4000 });
  Object.defineProperty(img, 'naturalHeight', { value: 3000 });
  fireEvent.load(img);
  return { img, frame, rotate: screen.getByRole('button', { name: 'لفّ الصورة' }) };
}

/** «لفّ الصورة» — a sideways photo of a notebook, turned to be read. */
describe('HomeworkImage', () => {
  it('keeps the bytes on the private route — turning never changes the source', () => {
    const { img, rotate } = renderImage();
    fireEvent.click(rotate);
    expect(img.getAttribute('src')).toBe(SRC);
  });

  it('turns a quarter per press and comes back upright after four', () => {
    const { img, rotate } = renderImage();
    expect(img.style.transform).toBe('rotate(0deg)');
    fireEvent.click(rotate);
    expect(img.style.transform).toBe('rotate(90deg)');
    fireEvent.click(rotate);
    fireEvent.click(rotate);
    fireEvent.click(rotate);
    expect(img.style.transform).toBe('rotate(0deg)');
  });

  it('gives a quarter-turned photo a frame of the turned shape, so the page is not cut off', () => {
    const { img, frame, rotate } = renderImage();
    expect(frame.style.aspectRatio).toBe('4000 / 3000');
    fireEvent.click(rotate);
    expect(frame.style.aspectRatio).toBe('3000 / 4000');
    // Laid out as wide as the turned frame is tall, centred: once turned it fills the frame.
    expect(parseFloat(img.style.width)).toBeCloseTo(133.33, 1);
    expect(parseFloat(img.style.marginInlineStart)).toBeCloseTo(-16.67, 1);
    expect(parseFloat(img.style.marginTop)).toBeCloseTo(16.67, 1);
    fireEvent.click(rotate);
    expect(frame.style.aspectRatio).toBe('4000 / 3000');
    expect(img.style.width).toBe('');
  });
});
