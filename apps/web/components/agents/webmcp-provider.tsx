'use client';

import { useEffect } from 'react';
import { buildWebMcpTools, type WebMcpTool } from '@/lib/agents/webmcp-tools';

/**
 * Registers this site's WebMCP tools with the browser, if the browser has
 * WebMCP at all (Chrome origin trial at time of writing; nothing else ships
 * it). Renders no DOM.
 *
 * ⚠️ Feature-detected, never assumed. `navigator.modelContext` is absent in
 * every current stable browser, so an unguarded call would throw during
 * hydration on every page load for every real student — the entire `(site)`
 * shell would go down to buy a capability almost nobody has yet.
 *
 * Mounted in `(site)/layout.tsx` only: the marketing shell, where the visitor
 * may well be anonymous. It is deliberately absent from `(app)` and `(admin)`,
 * because WebMCP tools execute with the page's own credentials — see the
 * read-only note in `lib/agents/webmcp-tools.ts`.
 */

/** The DOM lib has no WebMCP types yet; this is the shape the spec defines. */
interface ModelContext {
  provideContext: (context: { tools: WebMcpTool[] }) => void;
}

function modelContext(): ModelContext | null {
  if (typeof navigator === 'undefined') return null;
  const candidate = (navigator as Navigator & { modelContext?: unknown }).modelContext;
  if (!candidate || typeof candidate !== 'object') return null;
  const { provideContext } = candidate as Partial<ModelContext>;
  return typeof provideContext === 'function' ? (candidate as ModelContext) : null;
}

export function WebMcpProvider(): null {
  useEffect(() => {
    const context = modelContext();
    if (!context) return;

    try {
      context.provideContext({ tools: buildWebMcpTools() });
    } catch {
      // An origin trial API that changes shape between Chrome versions must
      // not be able to take the page down with it. A site that fails to
      // register three optional tools is a site that works.
    }
  }, []);

  return null;
}
