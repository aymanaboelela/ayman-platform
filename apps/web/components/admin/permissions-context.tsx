'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * The signed-in account's permissions, for `'use client'` controls deep inside
 * the dashboard — the same reason `entitlements-context.tsx` exists: the cover
 * field sits five client components below the page that knows the session.
 *
 * Hiding only. Every route the controls call checks the permission itself.
 * Outside the provider the answer is `false` — the direction that shows less.
 */
const PermissionsContext = createContext<ReadonlySet<string>>(new Set());

export function AdminPermissionsProvider({
  permissions,
  children,
}: {
  permissions: readonly string[];
  children: ReactNode;
}) {
  const value = useMemo(() => new Set(permissions), [permissions]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function useAdminCan(permission: string): boolean {
  return useContext(PermissionsContext).has(permission);
}
