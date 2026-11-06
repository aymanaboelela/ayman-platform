'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';

/**
 * «الفلوس مقفولة» — the owner's request, word for word: «ديما تبقى مقفولة،
 * أنا اللي أفتحها». He opens the dashboard with people beside him, so every
 * money figure starts blurred and only his own click shows it.
 *
 * ## Why the state lives in React and not in storage
 *
 * Remembering «open» across a reload is exactly what he asked NOT to have: a
 * reload, a new tab, the phone picking the laptop's session back up all start
 * closed. Within one visit it survives soft navigation, because this provider
 * sits in the admin layout and the layout is not remounted between screens.
 *
 * ## Why an attribute and a class, not a `<Money>` component
 *
 * The figures are rendered by server components across a dozen screens, as
 * plain strings from `formatEGP`/`formatAmount`. A client component around
 * each would turn every one of those screens' leaves into client islands for
 * a blur. Instead a figure carries `className="money"`, and
 * `[data-money='hidden'] .money` in `admin.css` blurs it. The server renders
 * `hidden`, so there is no first paint where the amounts are readable.
 */
const MoneyPrivacyContext = createContext<{ hidden: boolean; toggle: () => void } | null>(null);

export function MoneyPrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(true);
  return (
    <MoneyPrivacyContext.Provider value={{ hidden, toggle: () => setHidden((value) => !value) }}>
      {/* `display: contents` — the attribute is a CSS scope, not a box, so the
          admin grid below lays out exactly as it did without it. */}
      <div data-money={hidden ? 'hidden' : 'shown'} className="contents">
        {children}
      </div>
    </MoneyPrivacyContext.Provider>
  );
}

export function MoneyPrivacyToggle() {
  const state = useContext(MoneyPrivacyContext);
  if (state === null) return null;
  const label = state.hidden ? copy.admin.moneyShow : copy.admin.moneyHide;
  return (
    <button
      type="button"
      onClick={state.toggle}
      title={label}
      aria-label={label}
      aria-pressed={!state.hidden}
      className="flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-[160ms] hover:bg-surface-3 hover:text-fg aria-pressed:text-accent-text"
    >
      {state.hidden ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
    </button>
  );
}
