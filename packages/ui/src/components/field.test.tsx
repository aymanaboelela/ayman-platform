import { describe, expect, it } from 'vitest';
import { issuesForPath } from './field';

describe('issuesForPath', () => {
  it('matches a Zod 4 issue whose path is a PropertyKey array', () => {
    const issues = [{ message: 'مطلوب', path: ['email'] }];
    expect(issuesForPath(issues, 'email')).toHaveLength(1);
    expect(issuesForPath(issues, 'name')).toHaveLength(0);
  });

  it('matches a nested path with dot notation', () => {
    const issues = [{ message: 'مطلوب', path: ['contact', 'email'] }];
    expect(issuesForPath(issues, 'contact.email')).toHaveLength(1);
  });

  it('matches an array index path', () => {
    const issues = [{ message: 'مطلوب', path: ['items', 0, 'label'] }];
    expect(issuesForPath(issues, 'items.0.label')).toHaveLength(1);
  });

  it('accepts the object form of a path segment ({ key })', () => {
    const issues = [{ message: 'مطلوب', path: [{ key: 'contact' }, { key: 'email' }] }];
    expect(issuesForPath(issues, 'contact.email')).toHaveLength(1);
  });

  it('treats an issue with no path as form-level, matching only the empty name', () => {
    const issues = [{ message: 'فشل الحفظ' }];
    expect(issuesForPath(issues, '')).toHaveLength(1);
    expect(issuesForPath(issues, 'email')).toHaveLength(0);
  });

  it('returns every issue for the same field, not just the first', () => {
    const issues = [
      { message: 'قصير جدًا', path: ['phone'] },
      { message: 'صيغة غير صحيحة', path: ['phone'] },
    ];
    expect(issuesForPath(issues, 'phone')).toHaveLength(2);
  });
});
