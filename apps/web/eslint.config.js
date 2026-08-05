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
  {
    /**
     * `public/sw.js` — the service worker, and the second hand-written `.js`
     * file, for the same reason as the one above: the browser fetches it
     * verbatim, so it can never be TypeScript.
     *
     * It is linted at all because `public/` is NOT in this app's lint script,
     * and a service worker is the last file that should go unchecked — it sits
     * in front of every request the app makes and a mistake in it is invisible
     * until it serves the wrong bytes to the wrong person. `package.json` names
     * this one file rather than the whole directory, which also holds vendored
     * Pyodide.
     *
     * A worker runs in `ServiceWorkerGlobalScope`, not `window`: `self` is the
     * registration, and `clients` and `caches` do not exist anywhere else.
     * Listed explicitly to match the convention above.
     */
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        Promise: 'readonly',
      },
    },
  },
];
