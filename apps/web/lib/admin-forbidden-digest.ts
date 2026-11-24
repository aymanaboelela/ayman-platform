/**
 * The digest stamped on an admin read the API refused with `403`.
 *
 * The same device as `UPSTREAM_BUSY_DIGEST` (`./upstream-digest`): Next keeps a
 * digest that is already set, so a constant stamped on the server is the one
 * bit that survives to `(admin)/error.tsx` in a production build, where the
 * message does not.
 *
 * ## Why a refusal needs its own bit
 *
 * Permissions are per ACCOUNT (`permissionsForUser`), and a page reads several
 * routes that each carry their own. Measured on a teacher stack's
 * `/admin/errors`: an owner without `expense:read` opening «المالية», and
 * owners without `settings:read` opening «أسعار الكتب» and «رسايل للطلبة» —
 * 60+ rows, each one «الصفحة وقعت» for a screen that did exactly what it was
 * told. Without this bit the boundary cannot tell «not yours» from «broken»,
 * so it showed a crash, offered a retry that could never work, and filed a
 * row in the error log that nobody could fix.
 *
 * Its own module for the reason `./upstream-digest` gives: a tab from an older
 * build reading a newer chunk would see a fresh export on an existing module
 * as `undefined`.
 */
export const ADMIN_FORBIDDEN_DIGEST = 'ADMIN_FORBIDDEN';
