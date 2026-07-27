/**
 * Three motion invariants, enforced statically.
 *
 * 1. Animating a layout property (`width`, `height`, `top`, `left`, `filter`, …)
 *    forces layout and paint on EVERY frame. Measured cost: 30–60ms of INP on a
 *    page that does it once, and it is the classic cause of 300ms+ INP on
 *    scroll-driven pages. Transforms and opacity are composited; they are free.
 * 2. `motion.*` pulls the full ~34kB bundle. `<LazyMotion strict>` throws on it
 *    at runtime — this catches it at lint time instead, in CI, before deploy.
 * 3. Nothing animates longer than 400ms. Past that a transition reads as lag.
 *
 * `clipPath` is deliberately absent from the ban list: it is paint-only (no
 * layout), it is used exactly once (the Shiki code reveal), and it is skipped
 * under reduced motion.
 */

/** Layout/paint-forcing property → the composited property to use instead. */
const BANNED = new Map([
  ['width', 'scaleX'],
  ['height', 'scaleY'],
  ['minWidth', 'scaleX'],
  ['minHeight', 'scaleY'],
  ['maxWidth', 'scaleX'],
  ['maxHeight', 'scaleY'],
  ['top', 'y'],
  ['bottom', 'y'],
  ['left', 'x'],
  ['right', 'x'],
  ['inset', 'x/y'],
  ['insetInlineStart', 'x'],
  ['insetInlineEnd', 'x'],
  ['insetBlockStart', 'y'],
  ['insetBlockEnd', 'y'],
  ['margin', 'y'],
  ['marginTop', 'y'],
  ['marginBottom', 'y'],
  ['marginInlineStart', 'x'],
  ['marginInlineEnd', 'x'],
  ['padding', 'scale'],
  ['paddingTop', 'scale'],
  ['paddingInlineStart', 'scale'],
  ['filter', 'opacity'],
  ['backdropFilter', 'opacity'],
  ['boxShadow', 'opacity'],
  ['borderWidth', 'opacity'],
  ['fontSize', 'scale'],
  ['lineHeight', 'scale'],
]);

/** JSX props whose object value Motion interprets as an animation target. */
const ANIMATION_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'variants',
  'transition',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileDrag',
  'whileInView',
]);

const MOTION_PACKAGES = new Set(['motion/react', 'motion/react-client']);

/** 400ms, expressed the way Motion expresses it. */
const MAX_DURATION_SECONDS = 0.4;

/** Depth-first walk of an object literal, visiting every Property node. */
function walkObject(node, visit) {
  if (!node || node.type !== 'ObjectExpression') return;
  for (const prop of node.properties) {
    if (prop.type !== 'Property') continue;
    const key =
      prop.key.type === 'Identifier'
        ? prop.key.name
        : prop.key.type === 'Literal'
          ? String(prop.key.value)
          : null;
    if (key !== null) visit(prop, key);
    if (prop.value.type === 'ObjectExpression') walkObject(prop.value, visit);
  }
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Animate only composited properties, use `m` not `motion`, and cap durations at 400ms.',
    },
    schema: [],
    messages: {
      layoutProperty:
        'Animating "{{prop}}" forces layout and paint every frame. Animate "{{replacement}}" instead.',
      useLazyMotionM:
        'Import `m`, not `motion`. `motion` ships the full ~34kB bundle and throws inside <LazyMotion strict>.',
      durationCap:
        'A {{duration}}s animation exceeds the 400ms ceiling. Nothing in this product animates longer.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (!MOTION_PACKAGES.has(node.source.value)) return;
        for (const spec of node.specifiers) {
          const isNamedMotion =
            spec.type === 'ImportSpecifier' && spec.imported.name === 'motion';
          const isDefaultImport = spec.type === 'ImportDefaultSpecifier';
          // Deliberately NOT flagging `ImportNamespaceSpecifier`
          // (`import * as m from 'motion/react-client'`): that is the
          // documented Server Component pattern — `motion/react-client` has
          // no `m` named export to hang a `LazyMotion` context off (Server
          // Components cannot use context), so it re-exports every tag
          // directly and the namespace import is what reconstructs `m.div`.
          // Banning it blanket would false-positive on every Server
          // Component in this codebase that renders motion markup.
          if (isNamedMotion || isDefaultImport) {
            context.report({ node: spec, messageId: 'useLazyMotionM' });
          }
        }
      },

      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        if (!ANIMATION_PROPS.has(node.name.name)) return;
        const value = node.value;
        if (!value || value.type !== 'JSXExpressionContainer') return;

        walkObject(value.expression, (prop, key) => {
          const replacement = BANNED.get(key);
          if (replacement) {
            context.report({
              node: prop,
              messageId: 'layoutProperty',
              data: { prop: key, replacement },
            });
            return;
          }
          if (key !== 'duration') return;
          const literal = prop.value;
          if (literal.type !== 'Literal' || typeof literal.value !== 'number') return;
          if (literal.value <= MAX_DURATION_SECONDS) return;
          context.report({
            node: prop,
            messageId: 'durationCap',
            data: { duration: String(literal.value) },
          });
        });
      },
    };
  },
};
