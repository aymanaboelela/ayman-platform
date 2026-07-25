import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from './no-physical-direction.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-physical-direction', () => {
  it('passes valid and rejects invalid', () => {
    ruleTester.run('no-physical-direction', rule, {
      valid: [
        { code: 'const a = <div className="ms-4 pe-2 text-start border-s" />;' },
        { code: 'const a = <div className="flex gap-4 rounded-md" />;' },
        // "left" inside an unrelated word must not trip the rule
        { code: 'const a = <div className="leftover-thing" />;' },
        // margin-left in a comment or plain string is out of scope
        { code: 'const s = "ml-4";' },
      ],
      invalid: [
        {
          code: 'const a = <div className="ml-4" />;',
          output: 'const a = <div className="ms-4" />;',
          errors: [{ messageId: 'physical', data: { klass: 'ml-4', suggestion: 'ms-4' } }],
        },
        {
          code: 'const a = <div className="flex pr-2 text-right" />;',
          output: 'const a = <div className="flex pe-2 text-end" />;',
          errors: [
            { messageId: 'physical', data: { klass: 'pr-2', suggestion: 'pe-2' } },
            { messageId: 'physical', data: { klass: 'text-right', suggestion: 'text-end' } },
          ],
        },
        {
          code: 'const a = <div className={"border-l-2"} />;',
          output: 'const a = <div className={"border-s-2"} />;',
          errors: [{ messageId: 'physical', data: { klass: 'border-l-2', suggestion: 'border-s-2' } }],
        },
      ],
    });
  });
});
