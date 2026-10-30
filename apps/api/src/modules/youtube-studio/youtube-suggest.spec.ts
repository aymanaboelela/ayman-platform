import { YOUTUBE_DESCRIPTION_MAX, youtubeTagsLength } from '@ayman/contracts/youtube/studio';
import { composeSuggestion, parseIsoDuration, parseSrt, transcriptForPrompt, validChapters } from './youtube-suggest';

const cues = parseSrt(
  [
    '1\n00:00:01,000 --> 00:00:04,000\nمقدمة',
    '2\n00:00:30,000 --> 00:00:33,000\n<i>الجزء</i> الأول',
    '3\n00:02:00,000 --> 00:02:03,000\nالجزء التاني',
    '4\n00:05:00,000 --> 00:05:03,000\nالأسئلة',
  ].join('\n\n'),
);

describe('youtube-suggest', () => {
  it('parses SRT and strips markup', () => {
    expect(cues).toEqual([
      { start: 1, text: 'مقدمة' },
      { start: 30, text: 'الجزء الأول' },
      { start: 120, text: 'الجزء التاني' },
      { start: 300, text: 'الأسئلة' },
    ]);
    expect(transcriptForPrompt(cues)).toContain('[02:00] الجزء التاني');
    expect(transcriptForPrompt(cues, 20).split('\n')).toHaveLength(1);
  });

  it('reads ISO durations', () => {
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('PT45S')).toBe(45);
    expect(parseIsoDuration('P0D')).toBeNull();
  });

  it('keeps only chapters YouTube will honour', () => {
    // Starts at 00:00 even when the model says otherwise; drops an invented time,
    // one too close to the last, and one past the end.
    const chapters = validChapters(
      [
        { start: '00:05', title: 'مقدمة' },
        { start: '00:30', title: 'الأول' },
        { start: '00:35', title: 'قريب قوي' },
        { start: '01:11', title: 'متألف' },
        { start: '02:00', title: 'التاني' },
        { start: '05:00', title: 'الأسئلة' },
      ],
      cues,
      240,
    );
    expect(chapters).toEqual([
      { start: 0, title: 'مقدمة' },
      { start: 30, title: 'الأول' },
      { start: 120, title: 'التاني' },
    ]);
    // Fewer than three is none at all.
    expect(validChapters([{ start: '00:00', title: 'a' }, { start: '02:00', title: 'b' }], cues, null)).toEqual([]);
    expect(validChapters([{ start: '00:00', title: 'a' }], [], null)).toEqual([]);
  });

  it('strips links, contacts and angle brackets the model wrote, and flags masculine address', () => {
    const out = composeSuggestion(
      JSON.stringify({
        title: 'شرح <الدرس> كامل',
        description: 'شوف الشرح على www.other.example أو كلمنا 01012345678 أو a@b.co\n00:10 فصل مزيف',
        tags: ['#arrays', 'arrays', 'Arrays', 'مصفوفات'],
        chapters: [],
      }),
      { cues, durationSeconds: 300, courseLink: null },
    )!;
    expect(out.title).toBe('شرح الدرس كامل');
    expect(out.description).not.toMatch(/other\.example|01012345678|a@b\.co|فصل مزيف/);
    expect(out.tags).toEqual(['arrays', 'مصفوفات']);
    expect(out.voiceWarnings).toContain('شوف');
  });

  it('never cuts the course link or the chapters — the body gives way', () => {
    const link = 'https://teacher.example/courses/x?utm_source=youtube&utm_medium=description&utm_campaign=abcdefghijk';
    const out = composeSuggestion(
      JSON.stringify({
        title: 'عنوان',
        description: 'ك'.repeat(6000),
        tags: Array.from({ length: 80 }, (_, i) => `تاج رقم ${i}`),
        chapters: [{ start: '00:00', title: 'أ' }, { start: '00:30', title: 'ب' }, { start: '02:00', title: 'ج' }],
      }),
      { cues, durationSeconds: 400, courseLink: link },
    )!;
    expect(out.description.length).toBeLessThanOrEqual(YOUTUBE_DESCRIPTION_MAX);
    expect(out.description).toContain(link);
    expect(out.description.endsWith('02:00 ج')).toBe(true);
    expect(youtubeTagsLength(out.tags)).toBeLessThanOrEqual(500);
  });

  it('answers null for an answer with no usable JSON', () => {
    expect(composeSuggestion('sorry', { cues, durationSeconds: null, courseLink: null })).toBeNull();
    expect(composeSuggestion('{"description":"x"}', { cues, durationSeconds: null, courseLink: null })).toBeNull();
  });
});
