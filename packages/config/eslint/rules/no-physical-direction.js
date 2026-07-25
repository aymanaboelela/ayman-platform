/**
 * Bans physical-direction Tailwind utilities in favour of logical ones.
 * The platform is RTL-native: a physical `ml-4` is correct in LTR and wrong in RTL,
 * and the bug is invisible to anyone testing in English.
 */

/**
 * Ordered longest-prefix-first, corners before sides, so a corner class
 * (`rounded-tl-`) can never be shadowed by a shorter side rule (`rounded-l-`).
 */
const PREFIX_MAP = [
  ['rounded-tl-', 'rounded-ss-'],
  ['rounded-tr-', 'rounded-se-'],
  ['rounded-bl-', 'rounded-es-'],
  ['rounded-br-', 'rounded-ee-'],
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
  ['rounded-tl', 'rounded-ss'],
  ['rounded-tr', 'rounded-se'],
  ['rounded-bl', 'rounded-es'],
  ['rounded-br', 'rounded-ee'],
]);

/** Returns the logical replacement for a physical class, or null. */
function suggest(klass) {
  // Strip variant prefixes (`md:`, `hover:`, `dark:`).
  const lastColon = klass.lastIndexOf(':');
  const variants = lastColon === -1 ? '' : klass.slice(0, lastColon + 1);
  let base = lastColon === -1 ? klass : klass.slice(lastColon + 1);

  // Strip a leading `!` (important, Tailwind v3 style) ...
  const bang = base.startsWith('!') ? '!' : '';
  if (bang) base = base.slice(1);

  // ... then a leading `-` (negative value). Tailwind v3 writes the combined
  // form as `!-ml-4` (important before negative before the utility), which is
  // what this order reproduces. Tailwind v4's trailing-`!` important syntax
  // (`-ml-4!`) is NOT handled — see task-2-report.md fix-round notes.
  const neg = base.startsWith('-') ? '-' : '';
  if (neg) base = base.slice(1);

  const exact = EXACT_MAP.get(base);
  if (exact) return variants + bang + neg + exact;

  for (const [from, to] of PREFIX_MAP) {
    if (base.startsWith(from) && base.length > from.length) {
      return variants + bang + neg + to + base.slice(from.length);
    }
  }
  return null;
}

/**
 * Recursively collects every string-literal position that can be statically
 * determined inside a className expression. This covers not just a bare
 * string literal but template literals, clsx/cn(...)-style calls (any
 * callee — never hardcoded by name), ternaries, logical/binary expressions,
 * arrays, and object keys, so a helper like `cn()` cannot bypass the rule.
 *
 * Each collected entry carries `base`: the source offset of the entry's
 * text[0], so callers can compute exact, safe autofix ranges without
 * re-deriving quote/delimiter offsets per node shape.
 */
function collectStringEntries(node, out) {
  if (!node) return;

  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string') {
        // +1 skips the opening quote of the string literal.
        out.push({ node, value: node.value, base: node.range[0] + 1 });
      }
      return;

    case 'TemplateLiteral':
      // Only the static quasis are in scope — `${...}` expressions are never
      // touched, so a dynamic interpolation can't be misread as a class name.
      for (const quasi of node.quasis) {
        // +1 skips the single delimiter character immediately before the raw
        // text: the opening backtick for the first quasi, or the `}` that
        // closes the preceding `${` for every later quasi. Verified against
        // espree's actual TemplateElement ranges (see task-2-report.md).
        out.push({ node: quasi, value: quasi.value.raw, base: quasi.range[0] + 1 });
      }
      return;

    case 'CallExpression':
      for (const arg of node.arguments) collectStringEntries(arg, out);
      return;

    case 'ConditionalExpression':
      collectStringEntries(node.consequent, out);
      collectStringEntries(node.alternate, out);
      return;

    case 'LogicalExpression':
      collectStringEntries(node.left, out);
      collectStringEntries(node.right, out);
      return;

    case 'BinaryExpression':
      collectStringEntries(node.left, out);
      collectStringEntries(node.right, out);
      return;

    case 'ArrayExpression':
      for (const el of node.elements) {
        if (el) collectStringEntries(el, out);
      }
      return;

    case 'ObjectExpression':
      for (const prop of node.properties) {
        if (prop.type === 'SpreadElement') {
          collectStringEntries(prop.argument, out);
          continue;
        }
        const key = prop.key;
        if (key.type === 'Literal' && typeof key.value === 'string') {
          out.push({ node: key, value: key.value, base: key.range[0] + 1 });
        } else if (!prop.computed && key.type === 'Identifier') {
          // A bare (non-computed) identifier key has no surrounding quote.
          out.push({ node: key, value: key.name, base: key.range[0] });
        }
        // A computed, non-literal key (`{ [foo]: true }`) is a runtime value
        // we cannot statically resolve, so it is intentionally left alone.
      }
      return;

    default:
      return;
  }
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
    /** Report every offending class found inside one collected string entry. */
    function checkEntry({ node, value, base }) {
      let cursor = 0;
      for (const klass of value.split(/\s+/)) {
        if (!klass) continue;
        const index = value.indexOf(klass, cursor);
        cursor = index + klass.length;
        const suggestion = suggest(klass);
        if (!suggestion) continue;
        const start = base + index;
        context.report({
          node,
          messageId: 'physical',
          data: { klass, suggestion },
          fix(fixer) {
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

        const entries = [];
        if (v.type === 'Literal' && typeof v.value === 'string') {
          collectStringEntries(v, entries);
        } else if (v.type === 'JSXExpressionContainer') {
          collectStringEntries(v.expression, entries);
        }
        entries.forEach(checkEntry);
      },
    };
  },
};
