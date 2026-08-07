import { describe, expect, it } from 'vitest';
import { artVariant, hashString, subjectArt } from './subject-art';

/**
 * The properties that make generated artwork work at all. Every one of these
 * is something a reader would notice immediately if it broke, and none of them
 * is visible from reading the table.
 */
describe('subjectArt', () => {
  it('is stable for a subject — the same course is the same colour on every screen', () => {
    // The whole point of keying on the subject rather than on the course: the
    // dashboard card, the library card and the course page must agree.
    expect(subjectArt('الفيزياء')).toEqual(subjectArt('الفيزياء'));
    expect(subjectArt('لا يوجد')).toEqual(subjectArt('لا يوجد'));
  });

  it('tolerates the whitespace an admin-typed subject name arrives with', () => {
    expect(subjectArt('  الكيمياء  ')).toEqual(subjectArt('الكيمياء'));
  });

  it('gives every known subject a DISTINCT hue', () => {
    // A collision is invisible in the table and obvious on screen: two subjects
    // a student holds at once rendering as the same colour.
    const known = [
      'الرياضيات',
      'الفيزياء',
      'الكيمياء',
      'الأحياء',
      'البرمجة وعلوم الحاسب',
      'اللغة العربية',
      'اللغة الأجنبية الأولى',
      'اللغة الأجنبية الثانية',
      'التاريخ المصري',
      'الجغرافيا',
      'الفلسفة والمنطق',
      'التربية الدينية',
      'العلوم المتكاملة',
      'المحاسبة',
      'إدارة الأعمال',
      'علم النفس',
      'الاقتصاد',
      'الإحصاء',
    ];
    const hues = known.map((name) => subjectArt(name).hue);
    expect(new Set(hues).size).toBe(known.length);
  });

  it('keeps a science student\'s three subjects far apart on the wheel', () => {
    // The failure this guards is specific: physics, chemistry and biology are
    // taken TOGETHER, so they are the three most likely to be seen side by side
    // and the three most likely to have been assigned neighbouring hues.
    const [physics, chemistry, biology] = [
      subjectArt('الفيزياء').hue,
      subjectArt('الكيمياء').hue,
      subjectArt('الأحياء').hue,
    ];
    expect(Math.abs(physics - chemistry)).toBeGreaterThanOrEqual(30);
    expect(Math.abs(chemistry - biology)).toBeGreaterThanOrEqual(30);
  });

  it('gives an unknown subject a real hue and the generic glyph, never a default grey', () => {
    const art = subjectArt('مادة جديدة');
    expect(art.glyph).toBe('book');
    expect(art.hue).toBeGreaterThanOrEqual(0);
    expect(art.hue).toBeLessThan(360);
    // On the 15° wheel `hashHue` uses, so two unknown subjects are never 3°
    // apart — a difference nobody can see.
    expect(art.hue % 15).toBe(0);
  });

  it('separates unknown subjects that differ by one letter', () => {
    // The reason `hashString` is FNV-1a and not a character sum: Arabic subject
    // names differ from one another by a letter far more often than English
    // ones, and a sum collides on any rearrangement.
    expect(subjectArt('مادة أ').hue).not.toBe(subjectArt('مادة ب').hue);
  });

  it('produces the same hash in any JS runtime — the multiply stays 32-bit', () => {
    // `Math.imul` is what guarantees this. A plain `h * 16777619` loses
    // precision past 2^53 and drifts, which would make the server and the
    // client disagree about a colour and trip a hydration mismatch.
    expect(hashString('الفيزياء')).toBe(hashString('الفيزياء'));
    expect(Number.isSafeInteger(hashString('a'.repeat(200)))).toBe(true);
  });
});

describe('artVariant', () => {
  it('is one of the three compositions, stably', () => {
    expect(artVariant('dx-physics-modern')).toBe(artVariant('dx-physics-modern'));
    expect([0, 1, 2]).toContain(artVariant('anything'));
  });

  it('is seeded on the COURSE, so two courses in one subject differ', () => {
    // Not a guarantee for any given pair — three variants collide a third of
    // the time — but it must not be constant, which is what a subject-seeded
    // variant would be.
    const variants = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((slug) => artVariant(slug)),
    );
    expect(variants.size).toBeGreaterThan(1);
  });
});
