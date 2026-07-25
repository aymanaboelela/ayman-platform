import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import noPhysicalDirection from './rules/no-physical-direction.js';

/** The plugin that carries our project-specific rules. */
const ayman = {
  rules: { 'no-physical-direction': noPhysicalDirection },
};

/** Rules every package gets. */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { ayman },
    rules: {
      'ayman/no-physical-direction': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]",
          message:
            'Raw unsafe SQL is banned. Use parameterised $queryRaw or the Prisma query API.',
        },
      ],
    },
  },
];

/** Extra rules for React packages. */
export const react = [
  ...base,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
];

export default base;
