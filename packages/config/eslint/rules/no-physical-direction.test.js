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
        // inset-l-/inset-r- are not real Tailwind classes and were removed from
        // the map — they must pass through untouched, not be "corrected".
        { code: 'const a = <div className="inset-l-4 inset-r-4" />;' },

        // --- Fix round 2: recursion must not go where it isn't safe ---

        // NEW-1: `helper` is a nested, non-allowlisted call inside `cn(...)`.
        // `'left-icon'` is `helper`'s own argument, not a class — must not be touched.
        { code: "const a = <div className={cn('flex', helper(id, 'left-icon'))} />;" },
        // NEW-2: BinaryExpression with a comparison operator is not string
        // concatenation — the literal is a comparison target, not a class.
        { code: "const a = <div className={cn(dir === 'left-align', 'flex')} />;" },
        { code: "const a = <div className={cn(x !== 'margin-left', 'flex')} />;" },
        // A root call outside the builder allowlist is still scanned (rule (a)),
        // but an i18n-style lookup key like this never matches a physical
        // prefix as a whole token, so it correctly stays valid either way.
        { code: "const a = <div className={t('some.left-key')} />;" },
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

        // --- Fix round 1: variant / important / negative prefixes ---
        {
          code: 'const a = <div className="md:ml-4" />;',
          output: 'const a = <div className="md:ms-4" />;',
          errors: [{ messageId: 'physical', data: { klass: 'md:ml-4', suggestion: 'md:ms-4' } }],
        },
        {
          code: 'const a = <div className="!pr-2" />;',
          output: 'const a = <div className="!pe-2" />;',
          errors: [{ messageId: 'physical', data: { klass: '!pr-2', suggestion: '!pe-2' } }],
        },
        {
          code: 'const a = <div className="md:!pr-2" />;',
          output: 'const a = <div className="md:!pe-2" />;',
          errors: [{ messageId: 'physical', data: { klass: 'md:!pr-2', suggestion: 'md:!pe-2' } }],
        },
        {
          code: 'const a = <div className="-ml-4" />;',
          output: 'const a = <div className="-ms-4" />;',
          errors: [{ messageId: 'physical', data: { klass: '-ml-4', suggestion: '-ms-4' } }],
        },

        // --- Fix round 1: corner-radius utilities ---
        {
          code: 'const a = <div className="rounded-tl-lg rounded-tr-lg rounded-bl-lg rounded-br-lg" />;',
          output: 'const a = <div className="rounded-ss-lg rounded-se-lg rounded-es-lg rounded-ee-lg" />;',
          errors: [
            { messageId: 'physical', data: { klass: 'rounded-tl-lg', suggestion: 'rounded-ss-lg' } },
            { messageId: 'physical', data: { klass: 'rounded-tr-lg', suggestion: 'rounded-se-lg' } },
            { messageId: 'physical', data: { klass: 'rounded-bl-lg', suggestion: 'rounded-es-lg' } },
            { messageId: 'physical', data: { klass: 'rounded-br-lg', suggestion: 'rounded-ee-lg' } },
          ],
        },
        {
          code: 'const a = <div className="rounded-tl rounded-tr rounded-bl rounded-br" />;',
          output: 'const a = <div className="rounded-ss rounded-se rounded-es rounded-ee" />;',
          errors: [
            { messageId: 'physical', data: { klass: 'rounded-tl', suggestion: 'rounded-ss' } },
            { messageId: 'physical', data: { klass: 'rounded-tr', suggestion: 'rounded-se' } },
            { messageId: 'physical', data: { klass: 'rounded-bl', suggestion: 'rounded-es' } },
            { messageId: 'physical', data: { klass: 'rounded-br', suggestion: 'rounded-ee' } },
          ],
        },

        // --- Fix round 1: dynamic classNames must not bypass the rule ---

        // TemplateLiteral: only the static quasi is scanned, `${foo}` is untouched.
        {
          code: 'const a = <div className={`ml-4 ${foo}`} />;',
          output: 'const a = <div className={`ms-4 ${foo}`} />;',
          errors: [{ messageId: 'physical', data: { klass: 'ml-4', suggestion: 'ms-4' } }],
        },

        // CallExpression: any callee, not a hardcoded allow-list of helper names.
        {
          code: "const a = <div className={whatever('flex', 'ml-4')} />;",
          output: "const a = <div className={whatever('flex', 'ms-4')} />;",
          errors: [{ messageId: 'physical', data: { klass: 'ml-4', suggestion: 'ms-4' } }],
        },

        // ConditionalExpression: both branches.
        {
          code: "const a = <div className={cond ? 'ml-4' : 'mr-4'} />;",
          output: "const a = <div className={cond ? 'ms-4' : 'me-4'} />;",
          errors: [
            { messageId: 'physical', data: { klass: 'ml-4', suggestion: 'ms-4' } },
            { messageId: 'physical', data: { klass: 'mr-4', suggestion: 'me-4' } },
          ],
        },

        // LogicalExpression.
        {
          code: "const a = <div className={active && 'pr-2'} />;",
          output: "const a = <div className={active && 'pe-2'} />;",
          errors: [{ messageId: 'physical', data: { klass: 'pr-2', suggestion: 'pe-2' } }],
        },

        // BinaryExpression (string concatenation) — `+` still works after fix round 2.
        {
          code: "const a = <div className={'flex ' + 'ml-4'} />;",
          output: "const a = <div className={'flex ' + 'ms-4'} />;",
          errors: [{ messageId: 'physical', data: { klass: 'ml-4', suggestion: 'ms-4' } }],
        },

        // Fix round 2: nested allowlisted builder (`clsx` inside `cn`) still fires.
        {
          code: "const a = <div className={cn('a', clsx('ml-4'))} />;",
          output: "const a = <div className={cn('a', clsx('ms-4'))} />;",
          errors: [{ messageId: 'physical', data: { klass: 'ml-4', suggestion: 'ms-4' } }],
        },

        // ArrayExpression elements, inside a call argument.
        {
          code: "const a = <div className={cn(['flex', 'ml-4'])} />;",
          output: "const a = <div className={cn(['flex', 'ms-4'])} />;",
          errors: [{ messageId: 'physical', data: { klass: 'ml-4', suggestion: 'ms-4' } }],
        },

        // ObjectExpression keys (clsx/cn boolean-map style): Literal key flagged,
        // bare Identifier key ("flex") left alone because it isn't physical.
        {
          code: "const a = <div className={cn({ 'ml-4': active, flex: true })} />;",
          output: "const a = <div className={cn({ 'ms-4': active, flex: true })} />;",
          errors: [{ messageId: 'physical', data: { klass: 'ml-4', suggestion: 'ms-4' } }],
        },

        // Recursion depth > 1: LogicalExpression wrapping a ConditionalExpression
        // inside a CallExpression argument — proves the walk isn't one level deep.
        {
          code: "const a = <div className={cn('flex', active && (cond ? 'ml-4' : 'mr-4'))} />;",
          output: "const a = <div className={cn('flex', active && (cond ? 'ms-4' : 'me-4'))} />;",
          errors: [
            { messageId: 'physical', data: { klass: 'ml-4', suggestion: 'ms-4' } },
            { messageId: 'physical', data: { klass: 'mr-4', suggestion: 'me-4' } },
          ],
        },
      ],
    });
  });
});
