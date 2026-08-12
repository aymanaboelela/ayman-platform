'use client';

import { CatalogListSchema, type CatalogList } from '@ayman/contracts/catalog';
import { apiGet } from '@/lib/api';

/**
 * The course list المساعد shows on one node of its tree.
 *
 * Split out for the same reason as `./assistant-session`: `CatalogListSchema`
 * is a Zod schema, and a static import of it from the widget puts Zod into the
 * client reference of every route the widget mounts on. This one is the better
 * of the two splits, because the moment it loads is genuinely rare — the
 * student has to open the panel AND walk onto the «الكورسات» node — whereas
 * the session probe fires on every page load.
 *
 * `CatalogListSchema` lives in `./catalog`, not `./content`; the widget's own
 * comment says so because that mapping cost someone a build.
 */
export function loadAssistantCatalog(): Promise<CatalogList> {
  return apiGet('/api/catalog/courses', CatalogListSchema);
}
