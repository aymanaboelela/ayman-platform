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

/**
 * Names (bare identifier, or `.property` on any object) treated as class-list
 * builders. A CallExpression reached while already inside another call's
 * arguments (`insideCallArgs === true`, see `collectStringEntries`) is only
 * descended into when its callee is one of these — otherwise it's opaque: we
 * cannot know whether its return value is even a string, so we must not
 * guess that its arguments look like classes (fix round 2, NEW-1).
 */
const CLASS_BUILDER_NAMES = new Set([
  'cn',
  'clsx',
  'classnames',
  'classNames',
  'cx',
  'cva',
  'twMerge',
  'twJoin',
]);

/** True when `callee` is a bare identifier or member property naming a known class-list builder. */
function isClassBuilderCallee(callee) {
  if (!callee) return false;
  if (callee.type === 'Identifier') return CLASS_BUILDER_NAMES.has(callee.name);
  if (callee.type === 'MemberExpression') {
    const prop = callee.property;
    if (!callee.computed && prop.type === 'Identifier') return CLASS_BUILDER_NAMES.has(prop.name);
    if (callee.computed && prop.type === 'Literal' && typeof prop.value === 'string') {
      return CLASS_BUILDER_NAMES.has(prop.value);
    }
  }
  return false;
}

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
 * string literal but template literals, clsx/cn(...)-style calls, ternaries,
 * logical/`+`-binary expressions, arrays, and object keys, so a helper like
 * `cn()` cannot bypass the rule.
 *
 * `insideCallArgs` implements a single invariant (fix round 3, replacing the
 * round-2 "is this the root call" special case, which didn't generalize):
 * trust is lost only by descending through a CallExpression's arguments.
 * It starts `false` at the className expression itself. Every node type
 * OTHER than CallExpression propagates it unchanged — a ternary, `&&`, `+`,
 * array, or object wrapper neither grants nor revokes trust, so a call
 * reached through one of them (e.g. `cond ? helper('ml-4') : 'flex'`) is
 * still reached with `insideCallArgs === false` and gets scanned regardless
 * of its name (fix round 3, NEW-3). Only when we actually descend INTO a
 * CallExpression's own arguments does the flag flip to `true` for its
 * children — from that point on, a further nested call is opaque unless its
 * callee is a known class-list builder (`isClassBuilderCallee`), since we
 * can no longer assume its arguments (as opposed to its return value) are
 * what the outer call receives (fix round 2, NEW-1: `helper(id,
 * 'left-icon')` nested inside `cn(...)` must not be touched).
 *
 * A `BinaryExpression` is only descended into for `+` (string concatenation).
 * Every other operator (`===`, `!==`, `<`, `instanceof`, ...) is a comparison,
 * not a class-string builder, and descending into it would let the rule
 * "autofix" a comparison target — corrupting program behaviour (fix round 2,
 * NEW-2).
 *
 * Each collected entry carries `base`: the source offset of the entry's
 * text[0], so callers can compute exact, safe autofix ranges without
 * re-deriving quote/delimiter offsets per node shape.
 */
function collectStringEntries(node, out, insideCallArgs = false) {
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

    case 'CallExpression': {
      // Descend if we haven't already lost trust (this call isn't nested
      // inside another call's arguments), OR its callee is an allowlisted
      // class-list builder regardless of nesting. Descending always sets
      // insideCallArgs = true for the children, since we're now relying on
      // this call's ARGUMENTS rather than its return value.
      const shouldDescend = !insideCallArgs || isClassBuilderCallee(node.callee);
      if (shouldDescend) {
        for (const arg of node.arguments) collectStringEntries(arg, out, true);
      }
      return;
    }

    case 'ConditionalExpression':
      collectStringEntries(node.consequent, out, insideCallArgs);
      collectStringEntries(node.alternate, out, insideCallArgs);
      return;

    case 'LogicalExpression':
      collectStringEntries(node.left, out, insideCallArgs);
      collectStringEntries(node.right, out, insideCallArgs);
      return;

    case 'BinaryExpression':
      // Only `+` is string concatenation. `===`, `!==`, `<`, etc. compare a
      // value against a literal that is not a class name — descending would
      // let the rule rewrite a comparison target (fix round 2, NEW-2).
      if (node.operator === '+') {
        collectStringEntries(node.left, out, insideCallArgs);
        collectStringEntries(node.right, out, insideCallArgs);
      }
      return;

    case 'ArrayExpression':
      for (const el of node.elements) {
        if (el) collectStringEntries(el, out, insideCallArgs);
      }
      return;

    case 'ObjectExpression':
      for (const prop of node.properties) {
        if (prop.type === 'SpreadElement') {
          collectStringEntries(prop.argument, out, insideCallArgs);
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
          const expr = v.expression;
          if (expr.type === 'CallExpression') {
            // Rule (a): the call that IS the entire className expression is
            // always treated as a class-list builder regardless of its
            // callee's name — its return value is what className receives
            // directly, so its arguments are worth scanning. Any call
            // reached *inside* these arguments is no longer "the root" and
            // falls back to the allowlist check in the `CallExpression` case
            // of `collectStringEntries`.
            for (const arg of expr.arguments) collectStringEntries(arg, entries);
          } else {
            collectStringEntries(expr, entries);
          }
        }
        entries.forEach(checkEntry);
      },
    };
  },
};
