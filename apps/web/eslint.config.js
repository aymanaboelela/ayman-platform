import { react } from '@ayman/config/eslint';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...react,
  {
    /**
     * `cache-handler/redis.js` is the only hand-written `.js` file in this app —
     * it has to be, because Next imports it at runtime with no transform step.
     *
     * Everything else here is TypeScript, and `tseslint`'s recommended config
     * turns `no-undef` off for TS files because the compiler already does that
     * job. A plain `.js` file gets the rule back with no globals declared, so
     * the Node built-ins it runs on read as undefined.
     *
     * Listed explicitly rather than pulled from the `globals` package: these
     * four are all the file uses, and `globals` is not a declared dependency of
     * this app, only a transitive one.
     */
    files: ['cache-handler/**/*.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        ReadableStream: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
];
