'use client';

/**
 * The student shell's rail-collapse store.
 *
 * Deliberately the same shape as `lib/theme.ts`, for the same reason: the
 * value is persisted in `localStorage`, applied to `<html>` as an attribute
 * before first paint by `lib/security/prepaint-script.ts`, and read back here
 * only to drive a label and an icon. CSS owns the layout; this store owns
 * nothing the user can see move.
 *
 * That split is what keeps the rail flash-free. If the collapsed width came
 * from React state, the server — which cannot read `localStorage` — would
 * render the rail expanded on every load, and a student who had collapsed it
 * would watch 172px of layout snap away on hydration.
 *
 * ## التخزين تلات حالات، مش اتنين
 *
 * المفتاح `rail`، وقيمته `'collapsed'` أو `'expanded'` أو **مش موجود**. والغياب
 * معناه «الطالب مختارش» — مش «مفتوح».
 *
 * ده كان اتنين قبل كده (`'collapsed'` أو غياب = مفتوح)، والتغيير عشان حاجة
 * واحدة: الريل ٢٩٦ بكسل، وعلى آيباد رأسي (٨٢٠) بيسيب ٥٢٤ بكسل للمحتوى — عرض
 * فون على تابلت. فالستايل شيت محتاج يختار الافتراضي من **العرض**: التابلت
 * بيبدأ مقفول واللابتوب بيبدأ مفتوح.
 *
 * وده مستحيل على عقد من اتنين: لو الغياب معناه «مفتوح»، الطالب اللي عايزها
 * مفتوحة على التابلت مالوش قيمة يكتبها تغلب الافتراضي — كان هيتحبس مقفول.
 * دلوقتي أول ضغطة على الزرار بتكتب قيمة صريحة، والصريح بيغلب العرض دايمًا.
 *
 * `RailState` هي الحالة **الفعلية** (مفيش فيها «مختارش»): الـCSS مالهاش حالة
 * تالتة ترسمها، والزرار كمان لازم يقول «اقفل» أو «افتح». حل الغياب بيحصل في
 * `resolveRail` بنفس الشرط اللي الستايل شيت مكتوب بيه بالحرف.
 */

export type RailState = 'expanded' | 'collapsed';

/** اللي مخزّن فعلًا — `null` معناه مفيش اختيار. */
type StoredRail = RailState | null;

/**
 * الحد اللي الريل بيتفتح افتراضيًا من عنده — نفس رقم `lg` في تايلويند و نفس
 * الرقم اللي `globals.css` بيفتح عنده.
 *
 * ⚠️ الرقمين لازم يفضلوا واحد. لو اتفرقوا، الزرار هيقول «اقفل» على ريل مقفول
 * (أو العكس) في المدى اللي بينهم — مفيش CSS بيقدر يصلّح ده، والسكرين ريدر
 * بيقرا الغلط. `rail.test.ts` بيمسك الفرق بقراية الملفين.
 */
export const RAIL_EXPANDS_FROM_PX = 1024;

const STORAGE_KEY = 'rail';
const ATTRIBUTE = 'data-rail';

/** Registered by useSyncExternalStore; notified after every write. */
const listeners = new Set<() => void>();

/**
 * Used only when `localStorage` itself throws — Safari private browsing,
 * storage partitioning and some Firefox privacy settings make `getItem` and
 * `setItem` throw rather than degrade. Keeps the toggle usable for the session
 * even though nothing can persist.
 */
let memoryState: RailState = 'expanded';

export function applyRail(state: RailState): void {
  // القيمة الصريحة بتتكتب، مش بتتشال — الغياب بقى معناه «مختارش»، وشيلها كان
  // بيرجّع الطالب للافتراضي بتاع العرض بعد ما اختار بإيده.
  document.documentElement.setAttribute(ATTRIBUTE, state);
}

/**
 * الحالة الفعلية: المخزّن لو موجود، وإلا الافتراضي بتاع العرض.
 *
 * نفس الشرط اللي في `globals.css` بالحرف — `min-width: 64rem` هناك،
 * `RAIL_EXPANDS_FROM_PX` هنا. الزرار بيقرا من هنا، فلو الاتنين اتفرقوا بيقول
 * «اقفل» على ريل مقفول.
 */
export function resolveRail(stored: StoredRail, wideViewport: boolean): RailState {
  if (stored !== null) return stored;
  return wideViewport ? 'expanded' : 'collapsed';
}

/** `matchMedia` مش موجود في بيئة تست بدون DOM، والافتراضي وقتها «واسع» —
 *  نفس اللي `getServerRail` بيرجّعه، فمفيش فرق بين أول رندر وبعده. */
function wideViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(`(min-width: ${RAIL_EXPANDS_FROM_PX}px)`).matches;
}

export function readStoredRail(): RailState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored: StoredRail = raw === 'collapsed' || raw === 'expanded' ? raw : null;
    return resolveRail(stored, wideViewport());
  } catch {
    return memoryState;
  }
}

/**
 * SSR/hydration snapshot. Always 'expanded', because `localStorage` does not
 * exist on the server — and because it matches what the client renders before
 * its first post-hydration read, so there is no hydration mismatch. The
 * pre-paint script has already set the attribute by then; this value only
 * drives the toggle's label and chevron direction.
 */
export function getServerRail(): RailState {
  return 'expanded';
}

/**
 * Also listens for cross-tab `storage` events, so a change in another tab lands
 * here — **and** for the width query, which is new and load-bearing.
 *
 * من غير الاتنين، طالب مختارش حاجة وقلب الآيباد من رأسي لأفقي بيلاقي الريل
 * اتفتح (الـCSS) والزرار لسه بيقول «افتح» (الحالة القديمة في رياكت). الاستعلام
 * هو اللي بيعرف الدوران؛ `storage` عمره ما بيعرفه.
 */
export function subscribeRail(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);

  const query =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(`(min-width: ${RAIL_EXPANDS_FROM_PX}px)`)
      : null;
  query?.addEventListener('change', onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
    query?.removeEventListener('change', onStoreChange);
  };
}

export function setRail(state: RailState): void {
  applyRail(state);
  // Recorded before the write is attempted, so `readStoredRail`'s catch branch
  // still reflects what was just applied to the DOM even if the write throws.
  memoryState = state;
  try {
    // الاتنين بيتكتبوا. `removeItem` على «مفتوح» كان بيرجّع الطالب للافتراضي
    // بتاع العرض، فكان بيلاقي الريل بيتقفل تاني أول ما يفتح صفحة على التابلت.
    localStorage.setItem(STORAGE_KEY, state);
  } catch {
    // storage unavailable; the choice is session-only until it works again
  } finally {
    for (const listener of listeners) listener();
  }
}
