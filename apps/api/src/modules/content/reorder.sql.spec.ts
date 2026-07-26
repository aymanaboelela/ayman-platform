import { buildReorderSql } from './reorder.sql';

describe('buildReorderSql', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

  it('emits exactly ONE statement for 40 lessons', () => {
    const sql = buildReorderSql('lessons', 'section_id', 'sec-1', ids(40));
    expect((sql.text.match(/\bUPDATE\b/gi) ?? []).length).toBe(1);
    expect(sql.text).not.toContain(';');
  });

  it('parameterises every id and index — nothing is interpolated', () => {
    const sql = buildReorderSql('lessons', 'section_id', 'sec-1', ids(40));
    // 40 ids + 40 positions + 1 scope id
    expect(sql.values).toHaveLength(81);
    expect(sql.values[0]).toBe('id-0');
    expect(sql.values[1]).toBe(0);
    expect(sql.values.at(-1)).toBe('sec-1');
    for (const id of ids(40)) expect(sql.text).not.toContain(id);
  });

  it('scopes the UPDATE to the parent, so a foreign id cannot be moved', () => {
    const sql = buildReorderSql('lessons', 'section_id', 'sec-1', ids(3));
    expect(sql.text).toContain('"section_id" = $');
  });

  it('targets the app schema explicitly', () => {
    expect(buildReorderSql('lessons', 'section_id', 's', ids(1)).text).toContain('"app"."lessons"');
    expect(buildReorderSql('course_sections', 'course_id', 'c', ids(1)).text).toContain(
      '"app"."course_sections"',
    );
  });

  it('refuses an empty array rather than emitting VALUES ()', () => {
    expect(() => buildReorderSql('lessons', 'section_id', 's', [])).toThrow(/empty/i);
  });
});
