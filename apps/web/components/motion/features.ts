/**
 * The lazily-loaded feature bundle. Keeping it in its own module is what makes
 * `<LazyMotion features={() => import('./features')}>` produce a separate chunk:
 * the initial bundle carries only `m` (~5kB) and the ~15kB of DOM animation
 * features arrive after hydration. Importing `domAnimation` directly into the
 * provider would defeat the split and ship the full ~34kB up front.
 *
 * `domAnimation`, not `domMax`: layout projection and drag are not used anywhere
 * in this product, and they are the expensive half.
 */
export { domAnimation as default } from 'motion/react';
