/**
 * Task 3 (design tokens) only. Components land in Task 6 and will extend
 * this barrel with their own exports — for now it re-exports the token
 * objects so `@ayman/ui` (the `.` export) and `tsc --noEmit` both resolve.
 */
export * from './tokens/tokens';
