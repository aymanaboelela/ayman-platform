import type { Instrumentation } from 'next';

/**
 * Next's one hook for "a request failed on the server" — the only place the
 * real message of a Server Component throw still exists in a production build.
 * Everything it does lives in `lib/report-server-error.ts`, which says why.
 *
 * Imported lazily and only on the Node runtime, the pattern Next documents for
 * this file: `node:http` has no business in an edge bundle, and nothing here
 * runs at module scope, so a server that never fails never loads the reporter.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportServerError } = await import('./lib/report-server-error');
  reportServerError(error, request, context);
};
