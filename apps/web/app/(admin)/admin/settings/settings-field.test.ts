import { describe, expect, it } from 'vitest';
import type { FieldErrors } from 'react-hook-form';
import { issuesFromErrors } from './settings-field';

describe('issuesFromErrors', () => {
  it('converts an RHF field error into a StandardSchemaIssue keyed by field name', () => {
    const errors = {
      email: { type: 'invalid_string', message: 'بريد إلكتروني غير صالح' },
    } as unknown as FieldErrors;
    expect(issuesFromErrors(errors)).toEqual([
      { path: ['email'], message: 'بريد إلكتروني غير صالح' },
    ]);
  });

  it('skips an error entry with no message', () => {
    const errors = { phone: { type: 'required' } } as unknown as FieldErrors;
    expect(issuesFromErrors(errors)).toEqual([]);
  });

  it('returns one issue per field, matching <Field>\'s per-name lookup', () => {
    const errors = {
      titleAr: { type: 'too_big', message: 'طويل جدًا' },
      descriptionAr: { type: 'too_big', message: 'طويل جدًا كمان' },
    } as unknown as FieldErrors;
    expect(issuesFromErrors(errors)).toEqual([
      { path: ['titleAr'], message: 'طويل جدًا' },
      { path: ['descriptionAr'], message: 'طويل جدًا كمان' },
    ]);
  });

  it('returns an empty array when the form has no errors', () => {
    expect(issuesFromErrors({})).toEqual([]);
  });
});
