/**
 * Bans physical-direction Tailwind utilities in favour of logical ones.
 * The platform is RTL-native: a physical `ml-4` is correct in LTR and wrong in RTL,
 * and the bug is invisible to anyone testing in English.
 */

/** Ordered longest-prefix-first so `border-l-` is matched before `b`. */
const PREFIX_MAP = [
  ['border-l-', 'border-s-'],
  ['border-r-', 'border-e-'],
  ['rounded-l-', 'rounded-s-'],
  ['rounded-r-', 'rounded-e-'],
  ['scroll-ml-', 'scroll-ms-'],
  ['scroll-mr-', 'scroll-me-'],
  ['scroll-pl-', 'scroll-ps-'],
  ['scroll-pr-', 'scroll-pe-'],
  ['ml-', 'ms-'],
  ['mr-', 'me-'],
  ['pl-', 'ps-'],
  ['pr-', 'pe-'],
  ['left-', 'start-'],
  ['right-', 'end-'],
  ['inset-l-', 'inset-s-'],
  ['inset-r-', 'inset-e-'],
];

/** Exact class names with no numeric suffix. */
const EXACT_MAP = new Map([
  ['text-left', 'text-start'],
  ['text-right', 'text-end'],
  ['float-left', 'float-start'],
  ['float-right', 'float-end'],
  ['clear-left', 'clear-start'],
  ['clear-right', 'clear-end'],
  ['border-l', 'border-s'],
  ['border-r', 'border-e'],
  ['rounded-l', 'rounded-s'],
  ['rounded-r', 'rounded-e'],
]);

/** Returns the logical replacement for a physical class, or null. */
function suggest(klass) {
  // Strip variant prefixes (`md:`, `hover:`, `dark:`) and a leading `!`.
  const lastColon = klass.lastIndexOf(':');
  const variants = lastColon === -1 ? '' : klass.slice(0, lastColon + 1);
  let base = lastColon === -1 ? klass : klass.slice(lastColon + 1);
  const bang = base.startsWith('!') ? '!' : '';
  if (bang) base = base.slice(1);

  const exact = EXACT_MAP.get(base);
  if (exact) return variants + bang + exact;

  for (const [from, to] of PREFIX_MAP) {
    if (base.startsWith(from) && base.length > from.length) {
      return variants + bang + to + base.slice(from.length);
    }
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require logical direction utilities so RTL works natively.' },
    fixable: 'code',
    schema: [],
    messages: {
      physical:
        'Use the logical utility "{{suggestion}}" instead of the physical "{{klass}}". This app is RTL-native.',
    },
  },
  create(context) {
    /** Report every offending class inside one string literal node. */
    function checkLiteral(node, value) {
      let cursor = 0;
      for (const klass of value.split(/\s+/)) {
        if (!klass) continue;
        const index = value.indexOf(klass, cursor);
        cursor = index + klass.length;
        const suggestion = suggest(klass);
        if (!suggestion) continue;
        context.report({
          node,
          messageId: 'physical',
          data: { klass, suggestion },
          fix(fixer) {
            // +1 skips the opening quote of the literal.
            const start = node.range[0] + 1 + index;
            return fixer.replaceTextRange([start, start + klass.length], suggestion);
          },
        });
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className' && node.name.name !== 'class') return;
        const v = node.value;
        if (!v) return;
        if (v.type === 'Literal' && typeof v.value === 'string') {
          checkLiteral(v, v.value);
        } else if (
          v.type === 'JSXExpressionContainer' &&
          v.expression.type === 'Literal' &&
          typeof v.expression.value === 'string'
        ) {
          checkLiteral(v.expression, v.expression.value);
        }
      },
    };
  },
};
