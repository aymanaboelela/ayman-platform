import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from './no-layout-animation.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-layout-animation', () => {
  it('passes valid and rejects invalid', () => {
    ruleTester.run('no-layout-animation', rule, {
      valid: [
        { code: "import { m, AnimatePresence } from 'motion/react';" },
        { code: "import { m } from 'motion/react-client';" },
        // `motion` imported from something unrelated is not our business.
        { code: "import { motion } from './local-helpers';" },
        { code: 'const a = <m.div animate={{ opacity: 1, y: 0 }} />;' },
        { code: 'const a = <m.div transition={{ duration: 0.2 }} />;' },
        { code: 'const a = <m.div animate={{ y: 0, transition: { duration: 0.3 } }} />;' },
        // The sanctioned exception: paint-only, runs once, skipped under reduced motion.
        { code: "const a = <m.div animate={{ clipPath: 'inset(0 0 0 0)' }} />;" },
        // Static styles are not animations.
        { code: 'const a = <div style={{ width: 200, left: 0 }} />;' },
        // Non-numeric durations (a token reference) are not the rule's business.
        { code: 'const a = <m.div transition={{ duration: SECONDS.popover }} />;' },
      ],
      invalid: [
        {
          code: "import { motion } from 'motion/react';",
          errors: [{ messageId: 'useLazyMotionM' }],
        },
        {
          code: "import motion from 'motion/react';",
          errors: [{ messageId: 'useLazyMotionM' }],
        },
        {
          code: 'const a = <m.div animate={{ width: 200 }} />;',
          errors: [{ messageId: 'layoutProperty', data: { prop: 'width', replacement: 'scaleX' } }],
        },
        {
          code: "const a = <m.div whileHover={{ filter: 'blur(4px)' }} />;",
          errors: [{ messageId: 'layoutProperty', data: { prop: 'filter', replacement: 'opacity' } }],
        },
        {
          code: 'const a = <m.aside initial={{ left: -300, height: 0 }} />;',
          errors: [
            { messageId: 'layoutProperty', data: { prop: 'left', replacement: 'x' } },
            { messageId: 'layoutProperty', data: { prop: 'height', replacement: 'scaleY' } },
          ],
        },
        {
          code: 'const a = <m.div transition={{ duration: 0.6 }} />;',
          errors: [{ messageId: 'durationCap', data: { duration: '0.6' } }],
        },
        {
          code: 'const a = <m.div animate={{ y: 0, transition: { duration: 0.5 } }} />;',
          errors: [{ messageId: 'durationCap', data: { duration: '0.5' } }],
        },
        {
          code: 'const a = <m.li variants={{ animate: { marginTop: 0 } }} />;',
          errors: [{ messageId: 'layoutProperty', data: { prop: 'marginTop', replacement: 'y' } }],
        },
      ],
    });
  });
});
