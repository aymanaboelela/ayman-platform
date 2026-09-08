# Design system — complete reference for the Flutter client

Everything below is read out of the repo, not remembered. Every non-obvious claim cites a
repo-relative path. Values marked **BOTH** are identical in light and dark; values marked
**LIGHT** / **DARK** differ.

Source files, in cascade order as the browser sees them:

| Order | File | Owns |
|---|---|---|
| 1 | `packages/ui/src/tokens/index.css` | imports the five token files below |
| 2 | `packages/ui/src/tokens/color.css` | neutral / accent / ember / marketing ramps, borders, shadows |
| 3 | `packages/ui/src/tokens/viz.css` | chart palette |
| 4 | `packages/ui/src/tokens/typography.css` | type scale, weights, tracking, Arabic rules |
| 5 | `packages/ui/src/tokens/space.css` | spacing, radii, widths, focus ring, admin dims |
| 6 | `packages/ui/src/tokens/motion.css` | easings, durations, reduced-motion backstop |
| 7 | `packages/ui/src/tokens/direction.css` | `--dir-x` RTL mirror helper |
| 8 | `apps/web/app/globals.css` (2437 lines) | `@theme inline` Tailwind mapping + product chrome |
| 9 | `apps/web/app/study.css` (3783 lines) | the signed-in student surface |
| 10 | `apps/web/app/(admin)/admin.css` (608) | admin-only primitives |
| 11 | `apps/web/app/(site)/styles/theme.css` (422) | marketing `--site-*` semantic layer |
| 12 | `apps/web/app/(auth)/auth.css`, `(link)/styles/linkhub.css`, `(app)/store/store.css` | per-surface |

There is **no `tailwind.config.*`** anywhere in the repo (verified: `find . -name "tailwind.config*"`
returns nothing). Tailwind v4.3.3 (`apps/web/package.json`) is configured entirely in CSS via
`@theme inline { … }` at the top of `apps/web/app/globals.css`. Consequences for you:

* Tailwind's **default breakpoints** apply: `sm` 40rem/640px, `md` 48rem/768px, `lg` 64rem/1024px,
  `xl` 80rem/1280px, `2xl` 96rem/1536px. The codebase also uses two hand-written breakpoints:
  **30rem / 480px** (phone sheet, chip wrap) and **47.999rem / 767.98px** (the "below md" touch-target
  sweep).
* Tailwind's **default spacing multiplier** applies: `p-4` = 1rem = 16px, `gap-2` = 8px, etc.
* The root font size is **never overridden** — `packages/ui/src/tokens/typography.css` explicitly
  forbids `html { font-size: 15px }`. So 1rem = 16px unless the user changed their browser setting.

---

## 0. How the theme is chosen — READ THIS FIRST

**The platform does not follow the OS colour scheme.** This is the single most load-bearing fact in
this document and it contradicts what the CSS looks like at a glance.

* `apps/web/app/layout.tsx:91-95` renders `<html lang="ar" dir="rtl" data-theme="light" …>`.
  The attribute is **always present**, server-rendered, defaulting to `light`.
* `apps/web/lib/security/prepaint-script.ts` — the one inline script — runs in `<head>` and does:
  `d.setAttribute('data-theme', localStorage.getItem('theme')==='dark' ? 'dark' : 'light')`.
  It writes the attribute **unconditionally**.
* `apps/web/lib/theme.ts` header: *"LIGHT IS THE PLATFORM'S DEFAULT, and it does NOT follow the OS…
  `prefers-color-scheme` is consulted nowhere in this file."* Requested verbatim as
  «عاوز الديفولت بتاع المنصة كلها يبقى لايت مود».
* `applyTheme()` in the same file: *"ALWAYS an attribute, never a removal."*

Therefore every `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`
block in the stylesheets is **dead code in practice** — `data-theme="light"` is always on the root,
so the `:not()` never matches. They exist only as belt-and-braces. The live dark palette is the
`:root[data-theme="dark"]` block, which `packages/ui/src/tokens/color.css` keeps byte-identical to
the media-query copy (asserted by `packages/ui/src/tokens/tokens.test.ts`).

**Flutter contract:**

```
themeMode: ThemeMode.light | ThemeMode.dark   // NEVER ThemeMode.system
persisted key:   "theme"
persisted values: "light" | "dark"            // nothing stored => light
```

The toggle is a **two-position pill**, not a three-way system/light/dark cycle
(`apps/web/components/theme-toggle.tsx`: *"The pill has exactly two positions, and LIGHT is where
it starts"*).

---

## 1. Every CSS custom property

### Conversion assumption

All `oklch()` values below were converted **OKLCH → CIE-XYZ(D65) → linear sRGB → gamma-encoded
sRGB (IEC 61966-2-1)**, then clipped per-channel to `[0,1]`. Rows flagged **⚠︎gamut** are outside
the sRGB gamut and were clipped; a browser on a P3 display shows them slightly more saturated than
the hex, and Flutter's `Color` (sRGB 8-bit) will match the clipped hex, not the P3 rendering.
The conversion is self-verifying: `packages/ui/src/tokens/tokens.ts` hard-codes
`accentSolidHex: '#EFA22C'` for `oklch(0.770 0.152 72)` and this pipeline reproduces `#EFA22C` exactly.

ARGB column is Flutter's `Color(0xAARRGGBB)` literal at full opacity.

---

### 1.1 Neutral ramp `--n-1 … --n-12`

Declared as **literal hex** in both themes — `packages/ui/src/tokens/color.css`. Radix 12-step
semantics; the step number *is* the contract, stated at the top of that file:

```
1 app bg · 2 subtle bg · 3 UI bg · 4 hover · 5 active · 6 subtle border
7 border+focus · 8 hover border · 9 solid · 10 solid hover
11 low-contrast text · 12 high-contrast text
```

The ramp is **warm-leaning, hue ≈ 70 at very low chroma**. It used to be blue-leaning and was
changed so the marketing surface and the product read as one company.

| Token | LIGHT hex | LIGHT ARGB | DARK hex | DARK ARGB | Job |
|---|---|---|---|---|---|
| `--n-1` | `#FDFCFB` | `0xFFFDFCFB` | `#08090A` | `0xFF08090A` | page background |
| `--n-2` | `#F9F8F6` | `0xFFF9F8F6` | `#100F0E` | `0xFF100F0E` | card / panel fill |
| `--n-3` | `#F4F2EF` | `0xFFF4F2EF` | `#171512` | `0xFF171512` | UI element fill, hover ground |
| `--n-4` | `#ECEAE6` | `0xFFECEAE6` | `#1F1C18` | `0xFF1F1C18` | hover on `--n-3` |
| `--n-5` | `#E5E2DD` | `0xFFE5E2DD` | `#26221D` | `0xFF26221D` | active/pressed |
| `--n-6` | `#E0DCD7` | `0xFFE0DCD7` | `#29251F` | `0xFF29251F` | subtle border |
| `--n-7` | `#DAD6D0` | `0xFFDAD6D0` | `#332E27` | `0xFF332E27` | border + focus |
| `--n-8` | `#BEB9B1` | `0xFFBEB9B1` | `#423C33` | `0xFF423C33` | hover border |
| `--n-9` | `#918C84` | `0xFF918C84` | `#78716A` | `0xFF78716A` | solid neutral |
| `--n-10` | `#807B73` | `0xFF807B73` | `#8A837B` | `0xFF8A837B` | **placeholder text ONLY** |
| `--n-11` | `#666158` | `0xFF666158` | `#B4ACA3` | `0xFFB4ACA3` | secondary content text |
| `--n-12` | `#1A1714` | `0xFF1A1714` | `#F1EEEB` | `0xFFF1EEEB` | primary content text |

`--n-1` stays a true near-black `#08090A` in dark — *"the page base is a true near-black stage in
both surfaces, and warming it is what turns a dark UI sepia. Everything ELEVATED above it carries
the warmth instead."* This is why `.tile`, `.unit`, `.aside-card` and `.panel` all sit on `--n-2`
and never on `--n-1`: on dark, `--n-1` **is** the page, so a card painted with it is a hole.

`--n-10` vs `--n-11` — `globals.css` `@theme inline` maps `--color-fg-faint: var(--n-10)` and
comments at length: *"placeholder text ONLY — never for content… in dark mode `fg-muted` lands at
#A9AFB6, bright enough that a well-formed example value (`01012345678` in the phone field) read as
a value already entered."*

---

### 1.2 Accent ramp `--a-9 … --a-12` — "terminal amber", the ACTION colour

Only four steps exist (9–12). There is no `--a-1…--a-8`; anything needing a tint mixes from `--a-9`.
`packages/ui/src/tokens/color.css`: *"Green/red are reserved for quiz correctness, so neither can be
the brand; indigo is the AI default and is disqualified."*

| Token | LIGHT oklch | LIGHT hex | LIGHT ARGB | DARK oklch | DARK hex | DARK ARGB |
|---|---|---|---|---|---|---|
| `--a-9` (solid fill) | `0.770 0.152 72` | `#EFA22C` | `0xFFEFA22C` | `0.780 0.150 74` | `#F0A732` | `0xFFF0A732` |
| `--a-10` (solid hover) | `0.725 0.155 68` | `#E59114` | `0xFFE59114` | `0.820 0.150 76` | `#FBB541` | `0xFFFBB541` |
| `--a-11` (text on bg) | `0.520 0.120 62` | `#995600` | `0xFF995600` | `0.845 0.130 78` | `#FBC162` | `0xFFFBC162` |
| `--a-12` (high contrast) | `0.300 0.060 60` | `#43260A` | `0xFF43260A` | `0.920 0.090 80` ⚠︎gamut | `#FFDFA0` | `0xFFFFDFA0` |

**The fixed ink on amber is `#1A1206` in BOTH themes.** It is a hard-coded literal, never a token,
because `--a-9` is bright in both themes and a themed foreground would vanish in light mode. Call
sites: `packages/ui/src/components/button.tsx` (`primary`), `packages/ui/src/components/checkbox.tsx`
(indicator), `globals.css` `.brand__mark`, `.nav-pill__badge`, `.theme-pill__icon`,
`study.css` `.chip--solid` and `.attempt-row--action .attempt-row__well`,
`admin.css` `.section-tile__badge`.

**`--a-9` may never be used as TEXT.** `study.css` `.chip--accent` measures it at **2.00:1** on
`--n-1` in light mode. Amber prose is always `--a-11`.

---

### 1.3 Admin-selectable accent ramps

`packages/ui/src/lib/branding.ts` exports `ACCENT_RAMPS: Record<AccentSlot, {light, dark}>` where
each ramp is the 4-tuple `[--a-9, --a-10, --a-11, --a-12]`. An admin picks one; the server injects an
inline `<style>` overriding `:root:root{…}` (double `:root` is a deliberate specificity bump).
Slots: `amber` (default, byte-identical to §1.2), `cyan`, `blue`, `violet`, `magenta`, `slate`.
**Green and red are absent by design** — reserved for quiz correctness.

| Slot | 9 L | 10 L | 11 L | 12 L | 9 D | 10 D | 11 D | 12 D |
|---|---|---|---|---|---|---|---|---|
| `cyan` | `#36B8C5` | `#00ABB6` | `#007277`⚠︎ | `#083335` | `#4FC4D1` | `#5FD1E0` | `#7FDBEA` | `#B7F0FB` |
| `blue` | `#3D84EA` | `#2776DD` | `#1959A7` | `#132B4D` | `#5898F6` | `#6AA6FF`⚠︎ | `#92BFFF`⚠︎ | `#CBE3FF`⚠︎ |
| `violet` | `#9163D5` | `#8354C9` | `#63429B` | `#302049` | `#A57CE5` | `#B38BF1` | `#CAAAFA` | `#E9D8FF`⚠︎ |
| `magenta` | `#CD5CAC` | `#BE4CA1` | `#903B7C` | `#441B38` | `#DA76BB` | `#E985C7` | `#F4A6D6` | `#FFD4ED`⚠︎ |
| `slate` | `#6C7680` | `#5E6974` | `#48515B` | `#20262C` | `#86909B` | `#95A0AB` | `#B3BCC5` | `#DCE2E8` |

Same file also exports `RADIUS_RAMPS: Record<RadiusSlot, {xs,sm,md,lg}>` in px — an admin-selectable
corner style, hard-capped at 8px:

| Slot | xs | sm | md | lg |
|---|---|---|---|---|
| `sharp` | 0 | 2 | 3 | 4 |
| `default` | 3 | 4 | 6 | 8 |
| `soft` | 4 | 6 | 8 | 8 |

Radius is **theme-independent** — only the accent ramp is re-declared per theme by
`renderBrandingStyle()`.

---

### 1.4 Ember / STUDY ramp `--e-50 … --e-950` — the STRUCTURE colour

Hue 35 (the accent's neighbour at 72). **BOTH themes share all eleven raw steps**; only the four
semantic aliases re-point. `packages/ui/src/tokens/color.css`:

> amber (`--a-*`) = ACTION — buttons, the current stop, progress fills
> ember (`--e-*`) = STRUCTURE — the course stage, unit headers, chapter chrome
> `--ok`/`--err` = quiz correctness, as always. Never touched.
> A student can therefore learn one thing: **orange is what you press.**

| Token (BOTH themes) | oklch | hex | ARGB |
|---|---|---|---|
| `--e-50` | `0.977 0.009 35` | `#FDF5F3` | `0xFFFDF5F3` |
| `--e-100` | `0.946 0.026 35` | `#FEE7E2` | `0xFFFEE7E2` |
| `--e-200` | `0.902 0.048 35` | `#FDD4CA` | `0xFFFDD4CA` |
| `--e-300` | `0.828 0.070 35` | `#F0B7A8` | `0xFFF0B7A8` |
| `--e-400` | `0.745 0.120 35` | `#EE9078` | `0xFFEE9078` |
| `--e-500` | `0.660 0.170 35` | `#E76444` | `0xFFE76444` |
| `--e-600` | `0.552 0.171 35` | `#C1401F` | `0xFFC1401F` |
| `--e-700` | `0.470 0.140 35` | `#99351B` | `0xFF99351B` |
| `--e-800` | `0.392 0.113 35` | `#762915` | `0xFF762915` |
| `--e-900` | `0.325 0.089 35` | `#591F11` | `0xFF591F11` |
| `--e-950` | `0.222 0.055 35` | `#301008` | `0xFF301008` |

Semantic aliases — **these are what components read**:

| Alias | LIGHT → step | LIGHT hex | DARK → step | DARK hex | Job |
|---|---|---|---|---|---|
| `--e-stage` | `--e-700` | `#99351B` | `--e-800` | `#762915` | a band that carries white text |
| `--e-stage-deep` | `--e-800` | `#762915` | `--e-900` | `#591F11` | the band's far/deep gradient stop |
| `--e-ink` | `--e-600` | `#C1401F` | `--e-300` | `#F0B7A8` | ember TEXT on the page |
| `--e-tint` | `--e-50` | `#FDF5F3` | `--e-950` | `#301008` | washed surface a card BODY carries |
| `--e-tint-line` | `--e-200` | `#FDD4CA` | `--e-800` | `#762915` | the tint's hairline |
| `--e-art` | `--e-50` | `#FDF5F3` | `--e-900` | `#591F11` | a tinted BANNER (decoration, nothing to read) |

`--e-art` ≠ `--e-tint` **only in dark** — `--e-tint` at `--e-950` is within ~1% lightness of the
`#08090A` page, so a banner painted with it disappeared. Reported as «اللون وحش».

Measured contrasts recorded in `color.css` (recompute if you change anything):
white on `--e-700` 7.30:1 · white on `--e-800` 10.03:1 · white on `--e-900` 12.91:1 ·
`--e-600` on `--n-1` light 5.04:1 · `--e-300` on `--n-1` dark 11.37:1 · `--e-700` vs `--a-9` 3.43:1.

---

### 1.5 Marketing ramp `--p-50 … --p-950` — BOTH themes, no dark variant

Declared once at `:root` in `packages/ui/src/tokens/color.css` (promoted out of `.site` scope so
product surfaces can read it). `--p-400` is `--a-9` restated as a ramp step.

| Token (BOTH) | oklch | hex | ARGB |
|---|---|---|---|
| `--p-50` | `0.985 0.014 78` ⚠︎gamut | `#FFF9F0` | `0xFFFFF9F0` |
| `--p-100` | `0.960 0.032 76` | `#FFEFDB` | `0xFFFFEFDB` |
| `--p-200` | `0.918 0.064 75` | `#FEDFB5` | `0xFFFEDFB5` |
| `--p-300` | `0.862 0.102 73` | `#FBC785` | `0xFFFBC785` |
| `--p-400` | `0.795 0.140 66` | `#F8A84F` | `0xFFF8A84F` |
| `--p-500` | `0.720 0.170 56` | `#F28318` | `0xFFF28318` |
| `--p-600` | `0.640 0.190 48` ⚠︎gamut | `#E35D00` | `0xFFE35D00` |
| `--p-700` | `0.545 0.165 43` ⚠︎gamut | `#BA4500` | `0xFFBA4500` |
| `--p-800` | `0.445 0.128 42` | `#8B3509` | `0xFF8B3509` |
| `--p-900` | `0.360 0.095 45` | `#642908` | `0xFF642908` |
| `--p-950` | `0.235 0.060 48` | `#341302` | `0xFF341302` |

`--p-rgb: 214 96 22` — a raw triplet for `rgb(var(--p-rgb) / α)` washes inside gradient stops.
That is `#D66016`, and note it does **not** equal `--p-600`'s converted hex (`#E35D00`); it is a
hand-picked companion value used only for the marketing shadows.

---

### 1.6 Ink panel — surfaces that stay DARK IN BOTH THEMES

`packages/ui/src/tokens/color.css`. Used by: the marketing hero stage, code windows, the linkhub
route, `.tile--ink`, `<ProgressRing tone="ink">`, `.brand[data-tone='ink']`.
Deliberately near-neutral, not warm: *"a brown-black stage under an orange key light mixes into mud."*

| Token (BOTH) | value | hex | ARGB |
|---|---|---|---|
| `--ink` | `oklch(0.155 0.008 65)` | `#0F0C09` | `0xFF0F0C09` |
| `--ink-2` | `oklch(0.205 0.012 60)` | `#1B1612` | `0xFF1B1612` |
| `--ink-line` | `rgb(255 255 255 / 0.10)` | white @ 10% | `0x1AFFFFFF` |
| `--ink-fg` | `oklch(0.965 0.008 80)` | `#F6F3EE` | `0xFFF6F3EE` |
| `--ink-fg-2` | `oklch(0.780 0.020 70)` | `#C0B5AA` | `0xFFC0B5AA` |

⚠️ `--ink-fg-2` is tuned for `--ink` (near-black) and **fails on the ember stage** — 2.35:1 light /
3.06:1 dark. On any `.stage`/`.dash-hero` band the secondary colour is the locally declared
`--stage-fg-2: rgb(255 255 255 / 0.86)` = `0xDBFFFFFF` (`apps/web/app/study.css:86` and `:213`).

---

### 1.7 Semantic status colours — **theme-specific, deliberately different numbers**

`packages/ui/src/tokens/color.css`: the light values are *"deliberately darker and less chromatic…
the same OKLCH numbers that read well on #08090A read at ~2:1 on #FCFCFD."* Worst-case measured
text contrast ≥ 5.6:1, asserted in `packages/ui/src/tokens/tokens.test.ts`.

| Token | LIGHT oklch | LIGHT hex | LIGHT ARGB | DARK oklch | DARK hex | DARK ARGB |
|---|---|---|---|---|---|---|
| `--ok` | `0.476 0.130 150` | `#037031` | `0xFF037031` | `0.68 0.16 150` | `#3BB360` | `0xFF3BB360` |
| `--err` | `0.514 0.200 25` | `#C01323` | `0xFFC01323` | `0.62 0.20 25` | `#E64343` | `0xFFE64343` |
| `--warn` | `0.492 0.100 85` | `#7B5B02` | `0xFF7B5B02` | `0.75 0.14 85` | `#D6A62E` | `0xFFD6A62E` |
| `--info` | `0.488 0.122 245` | `#0265A0` | `0xFF0265A0` | `0.62 0.14 245` | `#288DD4` | `0xFF288DD4` |

Rules: `--ok`/`--err` are **quiz correctness only** (plus one carve-out: form field errors, documented
in `packages/ui/src/components/field.tsx` `FieldError` — *"`--err` is the one sanctioned non-quiz use
of red"*). A finished lesson is **never green** — see `.lesson-row--done` in §5.

---

### 1.8 Borders and hairline — alpha, never solid

*"borders are ALPHA, never solid: a solid #eaeaea looks wrong on any tinted bg."*

| Token | LIGHT | LIGHT ARGB | DARK | DARK ARGB |
|---|---|---|---|---|
| `--border-subtle` | `#00000014` (black 7.8%) | `0x14000000` | `#FFFFFF12` (white 7.1%) | `0x12FFFFFF` |
| `--border` | `#0000001F` (black 12.2%) | `0x1F000000` | `#FFFFFF1F` (white 12.2%) | `0x1FFFFFFF` |
| `--border-strong` | `#00000033` (black 20%) | `0x33000000` | `#FFFFFF33` (white 20%) | `0x33FFFFFF` |
| `--hairline` | `1px`; **`0.5px` at `@media (min-resolution: 2dppx)`** | | same | |

`--hairline` is a **BOTH** value. In Flutter, use `1 / MediaQuery.devicePixelRatioOf(context)` when
dpr ≥ 2, else `1.0`; every border in this product is exactly one physical hairline.

Global reset: `apps/web/app/globals.css` `@layer base { * { border-color: var(--border); } }` —
any element that turns a border on gets `--border` unless told otherwise.

---

### 1.9 Shadows

**Dark mode has NO shadows at all** — `--shadow-sm/md/lg` are all `0 0 0 transparent`. This is a
deliberate decision, documented at `.panel` in `globals.css`: *"a drop shadow on a near-black page is
invisible, and faking one with a darker blur just smears the background."*

| Token | LIGHT | DARK |
|---|---|---|
| `--shadow-sm` | `0 2px 5px 0 #00000012` (black 7.1%) | `0 0 0 transparent` |
| `--shadow-md` | `0 7px 14px 0 #00000012, 0 3px 6px 0 #0000000F` (7.1% + 5.9%) | `0 0 0 transparent` |
| `--shadow-lg` | `0 15px 35px 0 #00000014, 0 5px 15px 0 #00000012` (7.8% + 7.1%) | `0 0 0 transparent` |
| `--panel-lit` | `0 0 0 transparent` | `inset 0 1px 0 rgb(255 255 255 / 0.045)` |

`--panel-lit` (declared in `apps/web/app/globals.css`, in the `.panel` block) is what replaces the
shadow in dark: a **top-edge-only inset highlight at 4.5% white**. In Flutter you cannot express an
inset box-shadow on a `Container`; draw it as a 1px `Border(top: BorderSide(color: Color(0x0BFFFFFF)))`
painted **inside** the clip, or as the first row of a `CustomPaint`.

Marketing shadows (`.site` scope only, `apps/web/app/(site)/styles/theme.css`) are **warm** in light
and **plain black** in dark:

| Token | LIGHT | DARK |
|---|---|---|
| `--site-shadow-sm` | `0 1px 2px rgb(214 96 22 / .06), 0 2px 8px rgb(214 96 22 / .05)` | `0 1px 2px rgb(0 0 0 / .4)` |
| `--site-shadow-md` | `0 6px 16px rgb(214 96 22 / .09), 0 2px 6px rgb(214 96 22 / .06)` | `0 8px 24px rgb(0 0 0 / .45)` |
| `--site-shadow-lg` | `0 18px 48px rgb(214 96 22 / .14), 0 6px 16px rgb(214 96 22 / .08)` | `0 24px 60px rgb(0 0 0 / .55)` |

---

### 1.10 Spacing — `packages/ui/src/tokens/space.css`, **BOTH themes**

Named by pixel value (Stripe's convention). Mirrored in TS as
`packages/ui/src/tokens/tokens.ts` → `export const space = [2,4,8,12,16,20,24,32,48,64,80]`.

| Token | px | Token | px |
|---|---|---|---|
| `--s-2` | 2 | `--s-24` | 24 |
| `--s-4` | 4 | `--s-32` | 32 |
| `--s-8` | 8 | `--s-48` | 48 |
| `--s-12` | 12 | `--s-64` | 64 |
| `--s-16` | 16 | `--s-80` | 80 |
| `--s-20` | 20 | | |

### 1.11 Radii — **BOTH themes** (unless an admin picks a different `RadiusSlot`, §1.3)

*"Radius is deliberately small. Sharp corners read as precision."*

| Token | px | Flutter | Used for |
|---|---|---|---|
| `--r-xs` | 3 | `BorderRadius.circular(3)` | badges, kbd, menu items, small icon buttons |
| `--r-sm` | 4 | `circular(4)` | inputs, buttons, chips, nav-chips, verdicts, skeletons |
| `--r-md` | 6 | `circular(6)` | default; icon wells, lesson rows, dropdown panel |
| `--r-lg` | 8 | `circular(8)` | **the ceiling** — cards, modals, code blocks, stages, tiles |
| `--r-full` | 999 | `StadiumBorder` | **pills ONLY**: status chips, avatars, badges, switch, radio |

`packages/ui/src/components/card.tsx`: *"Radius is capped at --r-lg (8px)."*
`packages/ui/src/lib/branding.ts`: *"`lg` is the CARD radius and the spec's hard ceiling is 8px."*

Hand-written radii that step outside the token set (all in `apps/web/app/globals.css`):
`.brand__mark` 11px · `.stream-chip` / `.emphasis__chip` `0.375rem` = 6px ·
`.stream-field__option` `0.5rem` = 8px · `.course-subscribe` / `__plan-card` / `__upload`
`0.875rem` = 14px · `.course-subscribe__number-row` / `__success` / `__rejected` `0.625rem` = 10px ·
`.course-subscribe__upload-preview` `0.625rem` = 10px.

### 1.12 Widths, focus ring, tap size, layout dimensions

| Token | Value | Where declared | Note |
|---|---|---|---|
| `--w-shell` | `1152px` | `space.css` | READING measure — marketing pages, quiz runner, prose |
| `--w-prose` | `640px` | `space.css` | one column of text |
| `--w-app` | `1600px` | `space.css` | the signed-in APP's grid measure (dashboard, library, results, profile, path) — a **ceiling**, not a target |
| `--focus-ring-width` | `2px` | `space.css` | |
| `--focus-ring-offset` | `2px` | `space.css` | |
| `--min-tap-size` | `44px` | `space.css` | WCAG 2.5.5 / Apple HIG / Material |
| `--admin-sidebar-w` | `260px` | `space.css` | |
| `--admin-header-h` | `60px` | `space.css` | sticky offset for the admin selection bar |
| `--rail-w` | `296px` | `globals.css` | student nav rail, expanded (was 248, widened so long Arabic course titles are not truncated) |
| `--rail-w-collapsed` | `76px` | `globals.css` | icon-only rail |
| `--topbar-h` | `56px` | `globals.css` | the DIV inside `<header>`; the header adds a 1px bottom border, so the real occupied height is **57px** |
| `--header-blur` | `20px` | `color.css` | `backdrop-filter: blur()` on topbar/admin header |
| `--assistant-inset` | `1rem` (16px); **`0.5rem` below 30rem** | `globals.css` | distance from the inline-END (left) edge |
| `--assistant-launcher-h` | `3.5rem` (56px) | `globals.css` `.assistant-dock` | |
| `--assistant-launcher-inset` | `1.5rem` (24px) | `globals.css` | |
| `--assistant-stack-gap` | `0.75rem` (12px) | `globals.css` | |
| `--site-shell` | `1440px` | `(site)/styles/theme.css` | marketing max width |
| `--site-nav-h` | `4.5rem` (72px) | `(site)/styles/theme.css` | marketing header height |
| `--path-amp` | `3.25rem`; `1.5rem` ≤40rem; `5rem` ≥64rem | `globals.css` `.path-run` | learning-path wave amplitude |
| `--dir-x` | `1` under `[dir=ltr]`, `-1` under `[dir=rtl]` | `direction.css` | icon mirror multiplier |

Global focus style (`apps/web/app/globals.css` `@layer base`):

```css
:focus-visible { outline: 2px solid var(--a-9); outline-offset: 2px; }
:focus:not(:focus-visible) { outline: none; }
```

So: **a 2px amber ring, 2px outside the border box, on keyboard focus only.**
Two documented exceptions: `.unit__head:focus-visible { outline-offset: calc(-1 * 2px - 1px) }`
(the `<summary>` is flush against a clipped parent, so the ring must be drawn *inside*), and
`.tile--link:focus-visible { outline-offset: 2px }` restated explicitly.

### 1.13 z-index inventory

| Layer | z | Where |
|---|---|---|
| `.dot-grid`, `.app-bloom`, `.hero-bloom::before`, `.course-art__shapes`, `.site-btn::before/::after`, hero shader | `-1` (`-z-10` for the shader) | behind all content; relies on `body` establishing **no** stacking context — documented warning in `globals.css` |
| `.stage__body` | `1` | above the stage's dot texture |
| `.stage::after` (inset hairline) | `2` | above the body |
| admin bulk bar / sticky footers | `20` | |
| splash-cursor flourish | `30` | deliberately below the nav |
| student topbar `<header>`, admin `<header>` | `40` (`sticky top-0`) | |
| Dialog overlay + content, Sheet overlay + content, dropdown menu content, command palette, lightbox | `50` | |
| `.bprogress .bar` (route progress) | `60` | above the sticky header, below modals |
| assistant launcher + panel (`.assistant-dock`) | `70` | topmost |

---

### 1.14 Chart palette — `packages/ui/src/tokens/viz.css`

Eight-slot categorical set, **assigned in order, NEVER cycled**. Every value was computed, not
chosen: the order was produced by enumerating orderings and keeping only those where every adjacent
pair clears a ΔE floor under simulated protanopia/deuteranopia at severity 1.0. Slot 1 is the brand
amber on purpose.

Measured on the card surface (`--n-2`: `#F9F8F6` light, `#100F0E` dark):
worst adjacent pair CVD 14.3 light / 14.2 dark (floor 8) · worst adjacent normal 23.1 / 21.2
(floor 15) · worst all-pairs on slots 1–4: 7.9 CVD / 15.5 normal · every slot ≥ 3:1 vs surface.

> ⚠️ **Adding a ninth slot is not a matter of picking another nice colour.** Fold the tail into
> «غير ذلك», facet into small multiples, or use a table.
> Any part-to-whole chart ships a legend **and** a direct percentage **and** a table view.
> Past four slices, fold the tail.

**Categorical** — identity:

| Token | LIGHT oklch | LIGHT hex | DARK oklch | DARK hex | Hue name |
|---|---|---|---|---|---|
| `--viz-1` | `0.620 0.160 62` ⚠︎ | `#C86B00` | `0.660 0.160 62` ⚠︎ | `#D57700` | amber (brand) |
| `--viz-2` | `0.580 0.115 195` ⚠︎ | `#008F8F` | `0.640 0.120 195` ⚠︎ | `#00A2A3` | teal |
| `--viz-3` | `0.520 0.190 288` | `#694CCD` | `0.600 0.170 288` | `#7E6ADE` | violet |
| `--viz-4` | `0.600 0.200 8` | `#DB3869` | `0.630 0.185 8` | `#E04C74` | rose |
| `--viz-5` | `0.550 0.160 250` ⚠︎ | `#0074CA` | `0.620 0.150 250` | `#2F8ADC` | blue |
| `--viz-6` | `0.580 0.140 148` | `#319047` | `0.640 0.150 148` | `#3DA454` | green |

**Sequential** — magnitude, one hue, light→dark. Do NOT use `-100`/`-200` for discrete marks.

| Token | LIGHT hex | DARK hex |
|---|---|---|
| `--viz-seq-100` | `#F5D8C0` | `#432608` |
| `--viz-seq-200` | `#F1BF95` | `#603200` ⚠︎ |
| `--viz-seq-300` | `#EAA565` | `#7E4000` ⚠︎ |
| `--viz-seq-400` | `#E18725` | `#9C4E00` ⚠︎ |
| `--viz-seq-500` | `#CD6C00` ⚠︎ | `#B96000` ⚠︎ |
| `--viz-seq-600` | `#A85900` ⚠︎ | `#D27700` ⚠︎ |
| `--viz-seq-700` | `#814500` ⚠︎ | `#E59445` |

**Ordinal** — five ordered buckets (grade bands, funnel stages); step 1 is the low end. Every step
clears 2:1 on the surface.

| Token | LIGHT hex | DARK hex |
|---|---|---|
| `--viz-ord-1` | `#DC800C` | `#7E4000` ⚠︎ |
| `--viz-ord-2` | `#CA6900` ⚠︎ | `#9C4E00` ⚠︎ |
| `--viz-ord-3` | `#AF5900` ⚠︎ | `#B96000` ⚠︎ |
| `--viz-ord-4` | `#924B00` ⚠︎ | `#D07500` ⚠︎ |
| `--viz-ord-5` | `#763E00` ⚠︎ | `#E28E3A` |

**Chart chrome** — recessive by contract:

| Token | Value | Resolves to |
|---|---|---|
| `--viz-grid` | `var(--border-subtle)` | black 7.8% light / white 7.1% dark |
| `--viz-axis` | `var(--border)` | black 12.2% light / white 12.2% dark |
| `--viz-muted` | `color-mix(in oklch, var(--n-9), transparent 55%)` | `--n-9` @ **45% alpha** → `0x73918C84` light / `0x7378716A` dark |
| `--viz-track` | `color-mix(in oklch, var(--n-8), transparent 45%)` | `--n-8` @ **55% alpha** → `0x8CBEB9B1` light / `0x8C423C33` dark |

---

### 1.15 Decorative subject hues (`apps/web/lib/subject-art.ts`)

An 18-entry table mapping the exact Arabic subject name to an OKLCH **hue angle** and a lucide glyph.
The hue is fed into CSS as `--art-h` / `--tile-h` / `--card-art-h`; lightness and chroma are fixed
per-theme in CSS so a grid reads as one set.

> **The rule that keeps this from eroding the amber/ember split:** a decorative hue may only ever
> fill a **NON-INTERACTIVE CATEGORY MARK** — `.course-art`, `.subject-mark`, `.tile--hued`'s well,
> `.card-art__wash`. Never a border, never text, never a chip, never a button, never a status.

| Subject (`nameAr`) | hue | glyph key |
|---|---|---|
| `الرياضيات` | 265 | `sigma` |
| `الفيزياء` | 225 | `atom` |
| `الكيمياء` | 190 | `flask` |
| `الأحياء` | 160 | `leaf` |
| `البرمجة وعلوم الحاسب` | 300 | `braces` |
| `اللغة العربية` | 30 | `pen` |
| `اللغة الأجنبية الأولى` | 245 | `languages` |
| `اللغة الأجنبية الثانية` | 330 | `languages` |
| `التاريخ المصري` | 55 | `landmark` |
| `الجغرافيا` | 135 | `globe` |
| `الفلسفة والمنطق` | 280 | `brain` |
| `التربية الدينية` | 100 | `moon` |
| `العلوم المتكاملة` | 175 | `microscope` |
| `المحاسبة` | 85 | `calculator` |
| `إدارة الأعمال` | 20 | `briefcase` |
| `علم النفس` | 310 | `heart` |
| `الاقتصاد` | 45 | `trending` |
| `الإحصاء` | 205 | `chart` |

Unknown subject → `hashHue(name) = (FNV1a32(name) % 24) * 15` — a 24-step wheel (15° steps).
`hashString` is FNV-1a with `Math.imul` for 32-bit wrap; port it exactly or covers change colour
between platforms:

```dart
int hashString(String v) {
  int h = 2166136261;
  for (final c in v.codeUnits) {           // UTF-16 code units, like charCodeAt
    h ^= c;
    h = (h * 16777619) & 0xFFFFFFFF;       // Math.imul semantics
  }
  return h & 0xFFFFFFFF;
}
int hashHue(String v) => (hashString(v) % 24) * 15;
```

Fixed L/C per surface (hue varies):

| Surface | LIGHT | DARK |
|---|---|---|
| `.course-art` gradient stop 1 | `oklch(0.71 0.145 H)` | `oklch(0.60 0.145 H)` |
| `.course-art` gradient stop 2 | `oklch(0.47 0.120 H)` | `oklch(0.34 0.120 H)` |
| `.subject-mark` bg | `oklch(0.94 0.045 H)` | `oklch(0.28 0.055 H)` |
| `.subject-mark` fg | `oklch(0.45 0.115 H)` | `oklch(0.82 0.095 H)` |
| `.tile--hued .tile__well` bg | `oklch(0.94 0.045 H)` | `oklch(0.28 0.055 H)` |
| `.tile--hued .tile__well` fg | `oklch(0.45 0.115 H)` | `oklch(0.82 0.095 H)` |
| `.card-art__wash` | `oklch(0.62 0.13 H / 0.14)` | same |

Gradient: `linear-gradient(145deg, stop1 0%, stop2 100%)` — in Flutter,
`LinearGradient(begin: …, end: …)` at 145° measured **clockwise from the top** in CSS; the Flutter
equivalent is `begin: Alignment(-0.82, -0.57), end: Alignment(0.82, 0.57)` for a square box (recompute
per aspect ratio, or use `GradientRotation(math.pi * 145/180 - math.pi/2)`).

---

### 1.16 `@theme inline` — the Tailwind alias layer

`apps/web/app/globals.css` lines 8–54. These are the names components actually write
(`bg-surface-2`, `text-fg-muted`, `border-line`, …):

| Tailwind utility root | maps to |
|---|---|
| `--font-sans` | `var(--font-plex-arabic), ui-sans-serif, system-ui, sans-serif` |
| `--font-mono` | `var(--font-plex-mono), var(--font-plex-arabic), ui-monospace, monospace` |
| `surface-1 / 2 / 3 / 4` | `--n-1 / --n-2 / --n-3 / --n-4` |
| `line-subtle / line / line-strong` | `--border-subtle / --border / --border-strong` |
| `fg-muted` | `--n-11` |
| `fg-faint` | `--n-10` (**placeholders only**) |
| `fg` | `--n-12` |
| `accent` | `--a-9` |
| `accent-hover` | `--a-10` |
| `accent-text` | `--a-11` |
| `stage` | `--e-stage` |
| `stage-deep` | `--e-stage-deep` |
| `study` | `--e-ink` |
| `study-tint` | `--e-tint` |
| `study-line` | `--e-tint-line` |
| `ok / err / warn / info` | `--ok / --err / --warn / --info` |
| `radius-xs/sm/md/lg` | `--r-xs/sm/md/lg` |
| `ease-out / ease-pop` | `--ease-out / --ease-pop` |

### 1.17 `color-mix()` — how to reproduce it in Flutter

Two forms appear all over the codebase.

**Form A — `color-mix(in oklch, X, transparent P%)`.** This is *exactly* "X at (100−P)% alpha".
Per spec the mix is premultiplied, so the colour coordinates survive unchanged and only alpha moves.
Just use `X.withOpacity((100-P)/100)`.

| Occurrence | Result |
|---|---|
| `.nav-pill[aria-current=page]` background: `--a-9, transparent 88%` | accent @ **12%** alpha |
| `.nav-pill[aria-current=page] .nav-pill__well` bg: `transparent 80%` | accent @ **20%** |
| `.nav-pill[aria-current=page] .nav-pill__well` border: `transparent 62%` | accent @ **38%** |
| `.panel:hover` border: `--a-9, transparent 62%` | accent @ **38%** |
| `Badge` tone fills (`ok/err/warn/accent`): `transparent 92%` | tone @ **8%** |
| `Badge` tone borders: `transparent 70%` | tone @ **30%** |
| `.tile--accent .tile__well` bg: `transparent 86%` | accent @ **14%** |
| `.course-subscribe__plan-icon` bg: `transparent 88%` | accent @ **12%** |
| `.course-subscribe__upload` border: `transparent 45%` / bg `transparent 94%` | accent @ **55%** / **6%** |
| `.app-bloom`, `.hero-bloom` gradient stop: `transparent 94%` | accent @ **6%** |
| `.dot-grid` layers: `--n-12, transparent 96%` and `98%` | fg @ **4%** and **2%** |
| `Skeleton` base: `--n-12, transparent 95%` | fg @ **5%** |
| `Skeleton` shimmer mid-stop: `--n-12, transparent 92%` | fg @ **8%** |
| `::selection` bg: `--a-9, transparent 72%` | accent @ **28%** |
| `.theme-pill` bg: `--p-500, transparent 90%` | `#F28318` @ **10%** |
| `.attempt-row--action` border: `--a-9 45%, transparent` | accent @ **45%** |
| `.chip--accent` border: `--a-9 45%, transparent` | accent @ **45%** |
| `.stat-tile--waiting` border/bg: `transparent 62%` / `92%` | accent @ **38%** / **8%** |
| `.chip--danger:hover` border/bg: `--err transparent 70%` / `92%` | err @ **30%** / **8%** |
| `.topbar` (desktop only): `--n-1, transparent 20%` | page @ **80%**, behind `blur(20px)` |
| `.robot__shell` fill | `currentColor` @ **14%** |
| `.robot__vent/.robot__collar` | `currentColor` @ **45%** |
| `.robot__grille` | `currentColor` @ **30%** |

**Form B — `color-mix(in oklch, X P%, Y)`.** A real OKLCH interpolation, **including polar hue
interpolation along the shorter arc**. This is where a naive `Color.lerp` (which is sRGB-linear)
gives a visibly different result. ⚠️ It also produces a surprising artefact in dark mode: `--n-1`
(`#08090A`) has hue **246.3°** (blue-leaning), and the shorter arc from amber's 72° to 246° passes
through **green**, so an "8% amber wash" on the dark page is a cool grey, not a warm one. That is
genuinely what the browser paints. Pre-computed:

| Rule | Theme | Computed result |
|---|---|---|
| `.chip--accent` bg = `--a-9 8%, --n-1` | LIGHT | `#FDF5ED` (`0xFFFDF5ED`) |
| " | DARK | `#0D1519` (`0xFF0D1519`) |
| `.chip--accent:hover` bg = `--a-9 16%, --n-1` | LIGHT | `#FDEEDF` |
| " | DARK | `#102328` |
| `.runner-option:has(:checked)` bg = `--a-9 8%, --n-1` | LIGHT | `#FDF5ED` |
| " | DARK | `#0D1519` |
| `.attempt-row--action` bg = `--a-9 6%, --n-1` | LIGHT | ≈`#FDF7F1` |
| `.attempt-row--action:hover` bg = `--a-9 10%, --n-1` | LIGHT | ≈`#FDF3E9` |
| `.verdict--pass` bg = `--ok 12%, --n-1` | LIGHT | `#EEE7DB` |
| " | DARK | `#0D191F` |
| `.verdict--fail` bg = `--err 12%, --n-1` | LIGHT | `#F6E6D8` |
| " | DARK | `#0F1521` |
| `.unit[open] > .unit__head:hover` = `--e-tint, --e-stage 8%` | LIGHT | `#F7E6E1` |
| " | DARK | `#351209` |
| `.stage` radial highlight = `--e-stage, white 6%` | LIGHT | `#A1422B` |
| " | DARK | `#7F3624` |
| `.dropzone--active` bg = `in oklab, --a-9 12%, transparent` | BOTH | accent @ **12%** alpha (oklab + transparent ⇒ same as Form A) |
| `.badge-metal-*` (`study.css:776-798`) | BOTH | see §5.14 |

**Recommendation:** port a small `oklchMix(Color a, double wA, Color b)` helper (OKLab ↔ sRGB is
~15 lines) rather than using `Color.lerp`. If you use `Color.lerp` the light-theme washes are close
enough to pass, but the dark-theme ones are visibly wrong.

---

## 2. Typography

### 2.1 Families

`apps/web/lib/fonts.ts` loads both via `next/font/local` from
`apps/web/node_modules/@fontsource/…`.

* **`--font-plex-arabic` → IBM Plex Sans Arabic**, static weights only (no variable build of this
  family exists anywhere).
* **`--font-plex-mono` → IBM Plex Mono**, Latin only.
* `--font-sans` = `var(--font-plex-arabic), ui-sans-serif, system-ui, sans-serif`
* `--font-mono` = `var(--font-plex-mono), var(--font-plex-arabic), ui-monospace, monospace`

The two faces are **metrically identical** — x-height 516, cap-height 698 at 1000 upm — so mixed
Arabic/Latin runs like `استخدم const بدلاً من var` need no `size-adjust` correction.

`packages/ui/src/tokens/typography.css` deliberately does **not** declare the families — the token
package owns the scale, the app owns the files.

### 2.2 Font files that exist on disk

Paths are relative to `apps/web/node_modules/@fontsource/`. All are `.woff2`.

| File | Weight | Script | Bytes |
|---|---|---|---|
| `ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2` | 400 | Arabic | 42,848 |
| `…-arabic-500-normal.woff2` | 500 | Arabic | 45,296 |
| `…-arabic-600-normal.woff2` | 600 | Arabic | 45,688 |
| `…-arabic-700-normal.woff2` | 700 | Arabic | 44,280 |
| `…-latin-400-normal.woff2` | 400 | Latin | 19,164 |
| `…-latin-600-normal.woff2` | 600 | Latin | 20,500 |
| `…-latin-700-normal.woff2` | 700 | Latin | 19,504 |
| `ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2` | 400 | Latin | 14,708 |
| `…-latin-500-normal.woff2` | 500 | Latin | 14,888 |
| `…-latin-600-normal.woff2` | 600 | Latin | 15,620 |

**Latin 500 is missing on purpose** — nothing puts `font-medium` on a Latin-only run, and
per-character in-family fallback lands a stray Latin word inside a 500 Arabic line on latin-400,
still inside the family. **Plex Mono has no 700 on purpose** — the seven mono labels in the product
were changed to say `600` by name instead.

> **Can they be copied into a Flutter app? Yes.**
> `apps/web/node_modules/@fontsource/ibm-plex-sans-arabic/LICENSE` — *"This Font Software is licensed
> under the SIL Open Font License, Version 1.1."* Same for IBM Plex Mono. OFL permits bundling and
> redistribution inside an application; you must ship the licence text and must not sell the fonts
> on their own.
> **However Flutter cannot load `.woff2`** — `pubspec.yaml` fonts must be `.ttf` or `.otf`. Fetch the
> equivalent static TTFs from the upstream IBM Plex release (`IBMPlexSansArabic-Regular/Medium/
> SemiBold/Bold.ttf`, `IBMPlexMono-Regular/Medium/SemiBold.ttf`) rather than converting the subset
> woff2 — the Fontsource files are **script-subset** (`-arabic-` / `-latin-` are separate files with
> no `unicode-range`), and Flutter's fallback chain would need both halves registered under the same
> family with the same weight, which `FontWeight` cannot express.

### 2.3 `font-synthesis-weight: none` — global, on `html`

`apps/web/app/globals.css` `@layer base`. A **global kill switch** for faux bold.

> *"Arabic is the worst script to do that to, because the synthesis is a horizontal smudge and Arabic
> letterforms are joined: it thickens the joins into a blob rather than making the strokes heavier.
> Latin gets away with it; «مسار التعلّم» does not."*
> *"If you find yourself wanting to delete this line to get a heavier heading, the answer is a real
> face, not a synthesised one."*

**Flutter equivalent:** never request a `FontWeight` you have not registered as a real file. Register
exactly w400/w500/w600/w700 for Plex Sans Arabic and w400/w500/w600 for Plex Mono, and never write
`FontWeight.w800`/`w900`.

`font-synthesis-style` is deliberately untouched — there is no italic in either family and faux
italic is the only thing holding up emphasis in quoted text.

### 2.4 The base scale — `packages/ui/src/tokens/typography.css`

Dual-track: display and text ramps are separate. **Base is 15px, not 16 — "denser, more tool-like".**
Achieved through the rem scale itself (`0.9375rem`), never by overriding the root font size.

Arabic line-heights are the **default**; Latin (`:lang(en)`) swaps them down by ~0.15.
Values are unitless multipliers.

| Token | rem | px @16 root | `--lh-*` **AR (default)** | `--lh-*` EN | Default weight (`tokens.ts`) |
|---|---|---|---|---|---|
| `--fs-display-1` | 3.5 | **56** | 1.15 | 1.0 | 600 |
| `--fs-display-2` | 2.5 | **40** | 1.2 | 1.05 | 600 |
| `--fs-title-1` | 2 | **32** | 1.3 | 1.15 | 600 |
| `--fs-title-2` | 1.5 | **24** | 1.4 | 1.25 | 600 |
| `--fs-title-3` | 1.25 | **20** | 1.45 | 1.3 | 500 |
| `--fs-title-4` | 1.0625 | **17** | 1.5 | 1.35 | 500 |
| `--fs-text-lg` | 1.0625 | **17** | 1.75 | 1.6 | 400 |
| `--fs-text-base` | 0.9375 | **15** | 1.75 | 1.6 | 400 |
| `--fs-text-sm` | 0.875 | **14** | 1.65 | 1.5 | 400 |
| `--fs-text-xs` | 0.8125 | **13** | 1.55 | 1.4 | 400 |
| `--fs-mono-label` | 0.75 | **12** | 1.4 | **1.4** (same) | 500 |

`--lh-mono-label` is 1.4 in both scripts on purpose: *"it is a short label, not body text, so the
leading differential does not apply."*

`<body>` defaults: `font-size: var(--fs-text-base)` (15px), `line-height: var(--lh-text-base)`
(1.75), `font-weight: var(--fw-regular)` (400), `background: var(--n-1)`, `color: var(--n-12)`,
`text-rendering: optimizeLegibility`, `-webkit-font-smoothing: antialiased`.
`<html>` sets `line-height: var(--lh-text-base)` — *"Rule 2 — never `line-height: normal`."*

### 2.5 `.product-type` — the SIGNED-IN scale, one step up

`apps/web/app/globals.css:2284`. Applied to the student shell root
(`apps/web/components/app/student-shell.tsx:124` → `className="shell product-type"`), the admin
shell root (`apps/web/app/(admin)/layout.tsx:96`) and the account dropdown content
(`apps/web/components/app/account-menu-client.tsx:74`).

Requested as «كبّر الخطوط في الداشبورد بتاع الطالب والأدمن». Roughly +7–9% per rung.
**Display sizes are untouched — nothing in the product uses them.**

| Token | base rem / px | `.product-type` rem / px |
|---|---|---|
| `--fs-title-1` | 2 / 32 | **2.125 / 34** |
| `--fs-title-2` | 1.5 / 24 | **1.625 / 26** |
| `--fs-title-3` | 1.25 / 20 | **1.375 / 22** |
| `--fs-title-4` | 1.0625 / 17 | **1.125 / 18** |
| `--fs-text-lg` | 1.0625 / 17 | **1.1875 / 19** |
| `--fs-text-base` | 0.9375 / 15 | **1 / 16** |
| `--fs-text-sm` | 0.875 / 14 | **0.9375 / 15** |
| `--fs-text-xs` | 0.8125 / 13 | **0.875 / 14** |
| `--fs-mono-label` | 0.75 / 12 | **0.8125 / 13** |

Line-heights are **not** changed by `.product-type` — the AR multipliers above still apply.

> **For Flutter:** build two `TextTheme`s — the marketing/public one and the product one — or one
> `TextTheme` parameterised by a `bool productScale`. The public routes (`(site)`, `(auth)`,
> `(link)`) use the base scale; everything behind login uses `.product-type`.

### 2.6 Weights and tracking

| Token | Value |
|---|---|
| `--fw-regular` | 400 |
| `--fw-medium` | 500 |
| `--fw-semibold` | 600 |
| `--fw-bold` | 700 |
| `--tracking-tight` | `-0.022em` |
| `--tracking-label` | `0.06em` |

**Rule 1 — Arabic is a connected script; tracking breaks the joins.** Enforced globally:

```css
:where([lang="ar"]), :where([lang="ar"]) * { letter-spacing: 0 !important; }
.latin, code, kbd, samp, pre, .mono { letter-spacing: var(--tracking-tight) !important; }
```

The `:where()` wrapper contributes **zero specificity** so the Arabic reset only wins by default,
letting the bare-tag `code/kbd/samp/pre` rule keep its Latin tracking. This was a real bug — before
`:where()`, inline `<code>` never received its intended tracking.

**Flutter:** `letterSpacing: 0` on every Arabic run (which is nearly everything); `-0.022em` × fontSize
on Latin/mono runs only. There is no automatic per-script switch in Flutter — you must set it per
`TextSpan` when you mix scripts.

**Rule 3 — Arabic has no case, so an Arabic label is never uppercased.**

```css
.eyebrow { font-family: var(--font-mono); font-size: var(--fs-mono-label);
           line-height: var(--lh-mono-label); font-weight: var(--fw-medium); color: var(--n-11); }
.eyebrow:lang(en) { text-transform: uppercase; letter-spacing: var(--tracking-label) !important; }
.eyebrow:lang(ar) { text-transform: none; font-weight: var(--fw-semibold); }
```

So an Arabic eyebrow is **600 weight, 12px (13px in `.product-type`), mono face, `--n-11`, zero
tracking, no uppercase**.

**Numerals:** `table, .tabular, time, .score, .timer { font-variant-numeric: tabular-nums; }`.
Western (Latin) digits everywhere — the product formats with `ar-EG-u-nu-latn` on purpose.
In Flutter: `fontFeatures: [FontFeature.tabularFigures()]` and force Latin digits when formatting.

`.mono` is the brand carrier — badges, the theme toggle, eyebrow labels — and sets
`font-family: var(--font-mono)` in addition to the tracking.

### 2.7 The 16px input floor (iOS)

`packages/ui/src/components/input.tsx` / `textarea.tsx` / `select.tsx` all carry
`text-[1rem] md:text-[length:var(--fs-text-base)]` — **16px on phones, 15px from `md` up**.

> *"iOS Safari auto-zooms the whole viewport whenever it focuses a control whose computed font-size
> is under 16px… The zoom is not undone on blur, so the student is left scrolled and off-centre for
> the rest of the session."*

Not relevant to a native Flutter client (no viewport zoom), but reproduce the **visual** size: form
inputs on phone are 16px text, not 15.

### 2.8 Inline code and code blocks — `apps/web/app/globals.css` `@layer base`

```css
:not(pre) > code {
  font-family: var(--font-mono); font-size: 0.875em;
  padding: 0.125em 0.375em;
  border: var(--hairline) solid var(--border); border-radius: 0.3em;
  background: var(--n-3);
}
pre {
  font-family: var(--font-mono); font-size: 0.875rem; line-height: 1.5; tab-size: 4;
  padding: var(--s-16);
  border: var(--hairline) solid var(--border); border-radius: var(--r-lg);
  background: var(--n-2); overflow-x: auto;
}
```

Shiki-rendered blocks (`packages/ui/src/components/code-block.css`): `.shiki` is
`padding: 16px; font-size: 0.875rem; line-height: 21px; tab-size: 4; direction: ltr;
text-align: left` — **a deliberate LTR island inside the RTL document**, because code is Latin
regardless of `dir`. Arabic comments inside a sample get `font-family: var(--font-sans);
letter-spacing: 0` back.

---

## 3. Component vocabulary — exact geometry

All values below are the *shipped* geometry. `hairline` = 1px (0.5px @2dppx). Where a Tailwind class
appears, its resolved value is given.

### 3.1 `Button` — `packages/ui/src/components/button.tsx`

Base: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium`
→ **gap 8px, radius `--r-sm` (4px), weight 500, `white-space: nowrap`**.
Transition: `transition-colors duration-[var(--d-hover)] ease-[var(--ease)]` → **160 ms,
`cubic-bezier(0.25,0.1,0.25,1)`, colours only**.
Disabled: `disabled:pointer-events-none disabled:opacity-50` → **50% opacity, no hit test**.
Default `type="button"` (never an accidental form submit).

`whitespace-nowrap` is load-bearing: both sizes lock the box height, so a wrapped label renders
proud of its own border — this happened to «سلّم الامتحان» in the quiz footer at 320px.

**Sizes**

| Size | Height | Padding-inline | Font size |
|---|---|---|---|
| `sm` | **40px** (`h-10`), **32px** from `md` (`md:h-8`) | 12px (`px-3`) | `--fs-text-sm` |
| `md` | **40px** (`h-10`), all breakpoints | 16px (`px-4`) | `--fs-text-base` |

> *"40px on a phone, 32 from `md` up… every `sm` button came in at 32px tall — «اقفل الجهاز»,
> «غيّر صورتك» — which is under both platform touch guidelines and WCAG 2.5.5."*

**Variants** — *"Accent is used FLAT — never as a gradient."*

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| `primary` | `--a-9` | `#1A1206` (fixed, BOTH themes) | none | bg → `--a-10` |
| `secondary` | `--n-3` | `--n-12` | 1px `--border` | bg → `--n-4` |
| `ghost` | transparent | `--n-11` | none | bg → `--n-3`, text → `--n-12` |
| `danger` | transparent | `--err` | 1px `--err` | bg → `--err` @ **12%** alpha |

### 3.2 `.site-btn` — the marketing button (`(site)/styles/theme.css`)

Completely different shape from `Button`. **Pill, not rounded-sm.**

* `min-height: var(--min-tap-size)` = **44px**; `padding-inline: 1.5rem` = 24px; `gap: 0.5rem` = 8px
* `border-radius: var(--r-full)` = pill; `border: 1px solid transparent`
* `font-size: var(--fs-text-base)`; `font-weight: var(--fw-semibold)` (600); `white-space: nowrap`
* Transition: `background-color/border-color/color 160ms var(--ease)`, `transform 160ms var(--ease-pop)`,
  `box-shadow 160ms var(--ease)`
* `:hover { transform: translateY(-1px) }`; `:active { transform: translateY(0) }`
* `::before` — a **specular highlight**: `radial-gradient(7rem circle at var(--sx,-100%) var(--sy,50%),
  rgb(255 255 255 / 0.32), transparent 60%)` with `mix-blend-mode: plus-lighter`, opacity 0 → 1 on
  hover/focus. `--sx/--sy` are written by a cursor tracker per button.
* `::after` — a 1px lit top edge, `inset-inline: 12%`,
  `linear-gradient(to left, transparent, rgb(255 255 255 / 0.55), transparent)`, opacity 0 → 1.
* `.site-btn__arrow` nudges `translateX(-0.1875rem)` = −3px on hover.

Variants:

| Variant | Fill | Text | Border | Hover |
|---|---|---|---|---|
| `--solid` | `--site-accent-solid` | `--site-on-accent` | — | fill → `--site-accent-solid-hover`, shadow sm → md |
| `--outline` | transparent | `--site-fg` | `--site-line-strong` | border → accent-solid, text → accent-text |
| `--on-ink` | `rgb(255 255 255 / .06)` | `--ink-fg` | `rgb(255 255 255 / .28)` | bg `.12`, border `.5`, text `#fff` |
| `--light` | `#fff` | `oklch(0.22 0.02 60)` = `#221811` | — | bg → `--p-50`; `::before` becomes a `multiply` dark spot; `::after` hidden |

Marketing accent tokens (only place they differ from `--a-*`):

| Token | LIGHT | LIGHT hex | DARK | DARK hex |
|---|---|---|---|---|
| `--site-accent-solid` | `oklch(0.575 0.180 45)` ⚠︎ | `#CA4A00` | `oklch(0.720 0.175 55)` | `#F5810F` |
| `--site-accent-solid-hover` | `oklch(0.525 0.172 44)` ⚠︎ | `#B63C00` | `oklch(0.780 0.165 58)` ⚠︎ | `#FF9938` |
| `--site-on-accent` | `#FFFFFF` | | `oklch(0.180 0.020 50)` | `#190F0A` |
| `--site-accent-text` | `--p-700` | `#BA4500` | `--p-300` | `#FBC785` |
| `--site-accent-text-strong` | `--p-800` | `#8B3509` | `--p-200` | `#FEDFB5` |
| `--site-nav-card` | `#FFFFFF` (literal) | | `--n-2` | `#100F0E` |
| `--site-line` | `--p-600` @ **14%** | | `--border` | |
| `--site-line-strong` | `--p-600` @ **28%** | | `--border-strong` | |

> White on `--site-accent-solid` is **4.68:1** — clears AA for the 15px label. The obvious brighter
> orange one step up (`oklch(0.600 …)` = `#D25200`) comes out at **4.24:1** and fails.
> `apps/web/e2e/a11y.e2e.ts` catches it.

### 3.3 `Card` — `packages/ui/src/components/card.tsx`

| Part | Geometry |
|---|---|
| `Card` | radius `--r-lg` (8px), 1px `--border`, bg `--n-2` (`surface-2`), `box-shadow: var(--shadow-sm)` |
| `CardHeader` | `border-bottom: 1px var(--border-subtle)`, padding **20px / 16px** (`px-5 py-4`) |
| `CardTitle` | `<h3>`, `--fs-title-4`, weight 500, `line-height: var(--lh-title-4)` |
| `CardBody` | padding **20px / 16px** (`px-5 py-4`) |

### 3.4 `.panel` — the raised surface every signed-in screen is built from (`globals.css`)

The dominant container. **Two different visual strategies per theme, same class.**

```
border-radius : --r-lg (8px)
border        : hairline solid --border
background    : --n-2
box-shadow    : var(--shadow-sm), var(--panel-lit)
transition    : border-color / box-shadow / background-color 160ms var(--ease)

:hover  border-color: --a-9 @ 38% alpha
        box-shadow  : var(--shadow-md), var(--panel-lit)
```

* **LIGHT:** real two-layer drop shadow, `--panel-lit` is transparent.
* **DARK:** shadow is transparent; `--panel-lit` = `inset 0 1px 0 rgb(255 255 255 / 0.045)` — a
  top-edge highlight at 4.5% white. *"The landing page is lit: a near-black stage with one warm key
  light, and objects catch that light along their top edge."*
* **On hover the border warms toward the accent — the object never moves.** *"a card that lifts under
  the cursor on a dense screen makes the whole page feel loose."*

### 3.5 `Badge` — `packages/ui/src/components/badge.tsx`

`mono inline-flex items-center rounded-full border px-2 py-0.5 text-[length:var(--fs-mono-label)]
font-medium` →

* **Pill** (`--r-full`) — *"pills are for status chips and avatars only"*
* padding **8px inline / 2px block**
* mono face, `--fs-mono-label` (12px base / 13px in `.product-type`), weight 500
* 1px border

| Tone | Text | Border | Background |
|---|---|---|---|
| `neutral` | `--n-11` | `--border` | `--n-3` |
| `ok` | `--ok` | `--ok` @ 30% | `--ok` @ 8% |
| `err` | `--err` | `--err` @ 30% | `--err` @ 8% |
| `warn` | `--warn` | `--warn` @ 30% | `--warn` @ 8% |
| `accent` | `--a-11` | `--a-9` @ 30% | `--a-9` @ 8% |

### 3.6 `Input` / `Textarea` / `Select` — `packages/ui/src/components/`

Shared geometry:

```
display     : block; width: 100%
radius      : --r-sm (4px)
border      : 1px solid --border
background  : --n-2  (surface-2)
padding     : 12px inline (px-3), 8px block (py-2)
font-size   : 16px on phone, --fs-text-base from md
color       : --n-12 ; placeholder: --n-10 (Input) / --n-11 (Textarea)
transition  : colors 150ms ease-out
:hover           border-color: --border-strong
:focus-visible   border-color: --a-9
:disabled        cursor not-allowed; opacity 0.60
invalid          border-color: --err   (also sets aria-invalid)
```

`Textarea` adds `min-height: 8rem` (128px, `min-h-32`) and `field-sizing: content` (grows with text).
An "essay" variant uses `min-h-56` = 224px.

`Select` is a **native `<select>`** — *"There is deliberately no Radix `Select` in this product."*
On mobile that means the platform picker; in Flutter use a `CupertinoPicker`/`DropdownButton` per
platform rather than a custom listbox.

**No shadow on any field** — depth comes from the surface ladder.

### 3.7 `Label` — `packages/ui/src/components/label.tsx`

`mb-1.5 block text-[length:var(--fs-text-sm)] font-medium text-fg` →
margin-bottom **6px**, `--fs-text-sm`, weight 500, colour `--n-12`.
`required` renders `<span aria-hidden className="ms-1 text-accent-text">*</span>` — a `*` in
`--a-11`, 4px inline-start margin. **Never uppercase — Arabic has no case.**

### 3.8 `Field` primitives — `packages/ui/src/components/field.tsx`

| Part | Geometry |
|---|---|
| `FieldSet` | `<fieldset>`, `flex flex-col gap-4` (16px), no border, no padding |
| `FieldLegend` | `mb-2` (8px), `--fs-title-4`, weight **600** |
| `FieldGroup` | `grid gap-4 sm:grid-cols-2` — one column below 640px, two above |
| `Field` | `flex flex-col gap-1` (4px); wires id / `aria-invalid` / `aria-describedby` |
| `FieldLabel` | `--fs-text-sm`, weight 500, `--n-12` (no bottom margin — the `gap-1` handles it) |
| `FieldDescription` | `--fs-text-xs`, `--n-11` |
| `FieldError` | `--fs-text-xs`, `--err`, `role="alert" aria-live="polite"`; multiple issues joined with **` · `** |

`Field` never sets a physical `text-left`/`text-right` — direction comes from the ambient
`<html dir="rtl">` only.

### 3.9 `Checkbox` — Radix-backed, `packages/ui/src/components/checkbox.tsx`

```
size        : 20px (size-5), shrink-0
radius      : --r-xs (3px)
border      : 1px --border
background  : --n-2
transition  : colors 150ms ease-out
:hover           border-color --border-strong
:focus-visible   border-color --a-9
[checked]        border-color --a-9 ; background --a-9
:disabled        cursor not-allowed ; opacity 0.60
indicator   : 12px (size-3) SVG check, colour #1A1206,
              path "M3 8.5 6.5 12 13 4.5" on a 16×16 viewBox,
              stroke-width 2, round cap + join, fill none
```

### 3.10 `RadioGroup` / `RadioGroupItem`

```
RadioGroup      : flex flex-col gap-2 (8px), dir="rtl" passed EXPLICITLY (Radix arrow-key semantics)
RadioGroupItem  : size 20px, rounded-full, 1px --border, bg --n-2, colors 150ms ease-out
                  :hover border --border-strong ; :focus-visible border --a-9
                  [checked] border-color --a-9 (fill stays --n-2)
                  :disabled cursor not-allowed, opacity 0.60
Indicator       : 10px (size-2.5) circle, background --a-9
```

### 3.11 `Switch` — `packages/ui/src/components/switch.tsx`

**44 × 24 track, 20px thumb, 22px travel. The three numbers are derived, not guessed:
44 − 20 − 2 (start inset) = 22.**

```
Track : h-6 w-11 → 24 × 44 px ; rounded-full ; 1px --border ; bg --n-3
        transition-colors 150ms ease-out
        focus-visible: outline 2px, outline-offset 2px
        [checked]: border-color --a-9 ; background --a-9
        :disabled cursor not-allowed ; opacity 0.60
Thumb : size-5 → 20 px ; rounded-full ; bg --n-1 (surface-1) ; shadow none
        transition-transform 150ms ease-out
        off : translateX( +2px )  /  RTL: translateX( -2px )
        on  : translateX( +22px ) /  RTL: translateX( -22px )
```

The RTL negation is explicit because **`translate-x` has no logical CSS form** — it always shifts
along the physical X axis. In Flutter, `Directionality` handles this for `Align`/`Positioned` but not
for `Transform.translate`; negate the offset yourself when `TextDirection.rtl`.

Its previous size (`h-20 w-36` with a `size-16` thumb = 80×144 with a 64px ball) was reported as
«زرار معاينة مجانية دي أصغرها شوية».

### 3.12 `Dialog` — `packages/ui/src/components/dialog.tsx`

```
Overlay : fixed inset-0, z-50, background #000000B3  (black @ 70%)
          data-[state=closed]:animate-none
Content : fixed, dir="rtl" (a portal escapes <html dir>)
          start-1/2 top-1/2, -translate-x-1/2 rtl:translate-x-1/2, -translate-y-1/2
          width  : calc(100% - 2rem), max-width 420px
          max-h  : calc(100dvh - 2rem), overflow-y auto, overscroll-contain
          radius : --r-lg (8px)
          border : 1px --border
          bg     : --n-2
          padding: 20px (p-5)
          shadow : var(--shadow-lg)   [transparent in dark]
Close   : absolute end-1.5 top-1.5 → 6px from the inline-end and top
          size-11 = 44 × 44, grid place-items-center, radius --r-xs
          md: end-4 top-4, size-6 = 24 × 24
          colour --n-11 ; hover bg --n-3, colour --n-12 ; focus-visible outline 2px
          glyph : 16px (size-4) SVG X, viewBox 0 0 16 16, path "M3 3l10 10M13 3 3 13",
                  stroke-width 1.75, round cap, fill none
Header  : mb-4 (16px), flex-col gap-1 (4px)
Title   : --fs-title-4, weight 600, colour --n-12
Desc    : --fs-text-sm, colour --n-11
Footer  : mt-5 (20px), flex items-center justify-end gap-2 (8px)
```

`closeLabel` is a **required prop** — `@ayman/ui` carries no copy of its own; every user-facing
string comes from `@ayman/contracts`.

The `max-h` cap is a correctness fix, not polish: a dialog taller than the viewport centred with
`top-1/2 / -translate-y-1/2` grows off **both** ends and the overflow is unreachable (Radix locks
the body). `<ExamGateDialog>` measured ~690px and on a 640px phone «فاهم، ابدأ الامتحان» sat below
the fold — the student could not start the exam at all. `dvh` not `vh`, because `vh` is frozen to the
largest viewport.

**Android back closes the dialog** — wired inside the primitive via `useBackDismiss`
(`packages/ui/src/hooks/use-back-dismiss.ts`), which clicks the dialog's own close button so Radix's
focus restore and scroll unlock run. In Flutter this is `PopScope` / `WillPopScope` on the route.

### 3.13 `Sheet` — start-anchored full-height drawer

```
Overlay : identical to Dialog (fixed inset-0, z-50, #000000B3)
Content : fixed inset-y-0 start-0, z-50           ← inline START = the RIGHT edge in RTL
          width  : min(80vw, 20rem)   → capped at 320 px
          flex-col, gap-4 (16px), padding 16px (p-4)
          border-inline-end: 1px --border
          background: --n-2, overflow-y auto
Close   : identical geometry to Dialog's close (44×44 phone, 24×24 from md)
```

Both sheets in the product are the mobile navigation and are `md:hidden`.
The gap/padding were once `gap-16 p-16` — Tailwind resolves that to **64px**, which left the nav
labels almost no room in a 320px panel.

### 3.14 `DropdownMenu` — `packages/ui/src/components/dropdown-menu.tsx`

**`modal={false}` is the default here and it is a bug fix.** Radix's default `modal` wraps the menu in
`RemoveScroll`, which writes `body { overflow: hidden !important }`. Because this product sets
`html, body { overflow-x: clip }`, that makes `<body>` its own scroll container and **every
`position: sticky` element in the shell jumps off screen**. Measured at `scrollY: 1500`: the topbar
and the rail both went to `top: -1500`. Reported as «أضغط على أيمن ألاقي الحاجات بتختفي من على
اليمين… لازم أطلع فوق خالص عشان تظهرلي».

```
Root    : dir="rtl" (on the ROOT, not Content — Radix's Menu context reads it once at the top)
Content : portal ; z-50 ; min-width 10rem (160px)
          overflow hidden ; radius --r-md (6px) ; 1px --border ; bg --n-2
          padding 4px (p-1) ; text-align start ; shadow NONE
          sideOffset 4 ; align "start"
Item    : flex items-center gap-2 (8px) ; radius --r-xs (3px)
          padding 8px inline / 8px block (px-2 py-2)
          --fs-text-sm ; colour --n-12 ; outline none ; cursor default
          [highlighted] background --n-3
          [disabled] cursor not-allowed ; opacity 0.60
CheckboxItem : same, but `relative`, padding-inline-start 24px (ps-6) / end 8px (pe-2)
          indicator : absolute start-2 (8px), 14px box, lucide <Check size 14>
Label   : padding 8px/4px ; mono ; --fs-mono-label ; colour --n-11
```

### 3.15 `Table` — `packages/ui/src/components/table.tsx`

```
TableWrapper : w-full overflow-x-auto ; radius --r-lg ; 1px --border
Table        : w-full border-collapse ; --fs-text-sm ; tabular-nums (whole table)
TableHead    : <th scope="col"> ; border-bottom 1px --border ; bg --n-2
               padding 12px inline / 8px block ; text-align START
               MONO face ; --fs-mono-label ; colour --n-11 ; weight 500
TableCell    : border-bottom 1px --border-subtle ; padding 12px/8px ; text-align START
TableRow     : hover bg --n-2 ; [data-selected=true] bg --n-3
TableFooter  : border-top 1px --border ; bg --n-2 ; weight 500
TableCaption : mt-2 (8px) ; --fs-text-xs ; colour --n-11
```

### 3.16 `Skeleton` — `packages/ui/src/components/skeleton.tsx`

```
Bar        : height 16px (h-4) ; radius --r-sm ; overflow hidden
             background : --n-12 @ 5% alpha
Shimmer    : ::after overlay, absolute inset-0, initially translateX(-100%)
             animation `shimmer 1.8s infinite 180ms`   ← 1.8 s duration, 180 ms DELAY
             gradient: to-right  transparent → (--n-12 @ 8%) → transparent
Widths     : full 100% | wide 85% | narrow 60%
SkeletonText  : `space-y-3` (12px), widths cycle full / wide / narrow
SkeletonCardGrid : grid gap-4 (16px) ; sm:grid-cols-2 (+ lg:grid-cols-3 when columns=3)
                   each card: radius --r-lg, 1px --border-subtle, padding 20px (p-5)
                   contents: narrow bar h-3 (12px) mb-4, wide bar h-5 (20px) mb-3, then 2 text lines
```

The 180 ms delay is what stops a fast load from flashing a skeleton.
Keyframe (`packages/ui/src/tokens/motion.css` and duplicated in `globals.css`):
`@keyframes shimmer { 100% { transform: translateX(100%) } }` — **`translateX`, never
`background-position`** (the latter repaints the whole element every frame).
The sweep is **not mirrored in RTL** — it is decorative, not directional.

Varying bar widths is *"the single biggest difference between a skeleton that reads as designed and
one that reads as cheap."*

### 3.17 `Kbd`

`inline-flex min-w-[1.5rem] items-center justify-center rounded-[var(--r-xs)] border border-line
bg-surface-3 px-4 py-2 font-mono text-[length:var(--fs-mono-label)] text-fg-muted`
→ min-width 24px, radius 3px, 1px `--border`, bg `--n-3`, padding 16px/8px, mono 12px, `--n-11`.

### 3.18 `.chip` — the row-ending action/status marker (`apps/web/app/study.css:1308`)

The most common interactive object in the student surface.

```
display     : inline-flex, centred, gap 4px, flex-shrink 0
height      : 2rem  = 32 px          ← 2.5rem = 40 px BELOW 47.999rem
padding-x   : --s-12 = 12 px         ← 1rem = 16 px BELOW 47.999rem
radius      : --r-sm (4 px)
font        : --fs-text-sm, weight 500, white-space nowrap
transition  : background + color 160 ms var(--ease-out)
```

| Variant | Background | Text | Border / ring | Hover |
|---|---|---|---|---|
| `--solid` | `--a-9` | `#1A1206` | — | bg → `--a-10` |
| `--quiet` | `--n-1` | `--e-ink` | 1px `--e-tint-line` | bg → `--e-tint` |
| `--accent` | `--a-9` 8% over `--n-1` (see §1.17) | `--a-11` | 1px `--a-9` @ 45% | bg → `--a-9` 16% over `--n-1` |
| `--done` | `--e-tint` | `--e-ink` | `inset 0 0 0 1px --e-tint-line` | — |
| `--locked` | `--n-3` | `--n-11` | — | `cursor: not-allowed` |
| `--danger` (admin) | transparent | `--n-11` | 1px transparent | border `--err` @30%, bg `--err` @8%, text `--err` |
| `--on-stage` (admin) | see `admin.css:288` | | | |

> The split between them **is the colour rule in miniature**: `--solid` is amber because it is a
> thing you press; `--quiet`, `--done` and `--locked` are not actions and are therefore not amber.
> `--accent` is the *outlined* weight of amber — a real action that is not THE action.
> ⚠️ `--accent` uses `--a-11` for ink, never `--a-9`: `--a-9` as text on `--n-1` is **2.00:1** in
> light mode. `--a-11` on the 8% wash measures **5.28:1 light / 11.09:1 dark**.

### 3.19 `.tile` — one statistic (`study.css:1411`)

```
.tile        flex, align-items flex-start, gap 12 px, padding 16 px
             1px --border, radius --r-lg, background --n-2
             ≤30rem: padding 12 px, gap 8 px
.tile__body  min-inline-size 0 ; flex 1 1 auto
.tile__well  40 × 40 px (2.5rem)  → 32 × 32 px ≤30rem
             radius --r-md ; background --e-tint ; colour --e-ink
             (glyph inside is always 16 px — every call site passes `size-4`)
.tile__value --fs-title-2 ; line-height 1.1 ; weight 600 ; tabular-nums ; colour --n-12
.tile__label display block ; margin-top 2 px ; --fs-text-sm ; colour --n-11
.tile__suffix --fs-text-sm ; colour --n-11   (beside the number: a unit)
.tile__note  display block ; margin-top 8 px ; padding-top 8 px
             border-top 1px --border ; --fs-text-xs ; colour --n-11
```

Modifiers:

| Modifier | Effect |
|---|---|
| `--accent` | well bg → `--a-9` @ 14%, colour → `--a-11`. **Exactly one per screen.** |
| `--hued` | well bg/fg → the subject hue at fixed L/C (§1.15), driven by inline `--tile-h` |
| `--ink` | tile bg `rgb(255 255 255 / .10)`, border `.16`; well bg `.18`, colour `--ink-fg`; value `--ink-fg`; label/suffix/note `--stage-fg-2` (white 86%); note's top rule `.16` |
| `--metal` (only with `--ink`) | well becomes a struck metal — see §5.14 |
| `--link` | transition bg+border 160ms; hover border `--border-strong`; `--ink` variant hover bg `.16`, border `.28`; `focus-visible` outline-offset 2px. **No underline, no chevron, no lift.** |

⚠️ `--n-2` not `--n-1`: measured on production 2026-09-05, `body`, `.tile` and `.aside-card` all
painted `rgb(8,9,10)` in dark. «الشكل وحش، حسّن شكل الديزاين» is what one flat value looks like.

### 3.20 `.nav-pill` — one navigation row, shared by the student rail, the admin sidebar and both mobile sheets (`globals.css:2300+`)

```
.nav-pill        relative flex, align-items center, gap 12 px
                 min-block-size 3.25rem = 52 px
                 padding-inline 12 px ; radius --r-lg
                 colour --n-11 ; font-size --fs-text-lg  (19 px inside .product-type)
                 transition background-color + color 160 ms var(--ease)
      :hover     background --n-3 ; colour --n-12
.nav-pill__well  grid place-items-center ; 36 × 36 px (2.25rem) ; flex-shrink 0
                 radius --r-md ; 1px --border-subtle ; background --n-3 ; colour inherit
                 transition bg + border + colour 160 ms
.nav-pill__well svg   18.4 px (1.15rem) — set HERE, overriding every call site's `size-4`
.nav-pill__label      min-inline-size 0 ; overflow hidden ; ellipsis ; nowrap
```

Current page (`[aria-current="page"]`):

```
background : --a-9 @ 12 %
colour     : --a-11
weight     : 500
well       : border --a-9 @ 38 % ; background --a-9 @ 20 % ; colour --a-11
::before   : absolute ; inset-block 8 px ; inset-inline-START −12 px
             inline-size 3 px ; radius 999 px ; background --a-9
```

The 3px marker sits on the inline **start** — the right edge in RTL — *"so it reads as a tab pulled
out of the rail's own border."* This is **the one place in the shell where amber marks a state
rather than a control**, and it earns it: it is the answer to "where am I".

`.nav-pill__badge` — the count on «الوارد» / «المدفوعات» / «الكتب»:

```
margin-inline-start auto ; grid place-items-center ; min-inline-size 20 px ; flex-shrink 0
padding 6 px inline / 1 px block ; radius 999 px
background --a-9 ; colour #1A1206
--fs-mono-label ; weight 500 ; tabular-nums
```

It keeps its amber fill in **every** state — *"a badge that changes colour with the row would read as
part of the row rather than as a number owed."* `admin.css`'s `.section-tile__badge` is
byte-identical, on purpose.

`.nav-group__head` (a group heading in the rail): padding-inline 12px, padding-block-end 4px,
`--fs-text-base`, weight 500, colour `--n-10`.

### 3.21 `.stage` — the band a course or a page introduces itself on (`study.css:53`)

```
position relative ; isolation isolate ; overflow hidden ; radius --r-lg
background (two layers, in this order):
  1. radial-gradient(120% 140% at 85% 0%,
       color-mix(in oklch, var(--e-stage), white 6%) 0%, transparent 60%)
       → #A1422B light / #7F3624 dark at the stop
  2. linear-gradient(160deg, var(--e-stage) 0%, var(--e-stage-deep) 100%)
colour: --ink-fg ; local --stage-fg-2: rgb(255 255 255 / 0.86)

::before  a dot texture:
  radial-gradient(rgb(255 255 255 / 0.14) 1px, transparent 1px), size 14 × 14 px
  mask-image: linear-gradient(to right, black 0%, transparent 72%)   ← PHYSICAL `to right`
  opacity 0.55 ; pointer-events none
::after   inset hairline ring, z-index 2:
  box-shadow: inset 0 0 0 var(--hairline) rgb(255 255 255 / 0.12)

.stage__body    position relative ; z-index 1 ; padding 24 px  (32 px from 768 px up)
.stage__eyebrow --stage-fg-2 ; mono ; --fs-mono-label ; letter-spacing 0.04em
.stage__title   margin-top 8 px ; --fs-title-1 ; --lh-title-1 ; weight 600 ; --ink-fg ; text-wrap balance
.stage__sub     margin-top 8 px ; max-width --w-prose ; --stage-fg-2
.stage__facts   flex wrap ; gap 8 px / 20 px ; margin-top 16 px ; mono ; --fs-mono-label ; --stage-fg-2
.stage__fact    inline-flex ; gap 6 px
.stage__back    inline-flex ; gap 6 px ; --stage-fg-2 ; --fs-text-sm ; hover → --ink-fg
```

The radial highlight is at **6%**, not the 18% it shipped with: at 18% the surface lifted to a
lightness where `--ink-fg-2` measured **2.35:1** — half the required ratio, on the two smallest
strings on the band.

### 3.22 `.unit` — a collapsible course section (`<details>`) (`study.css:887`)

```
.unit                 1px --border ; radius --r-lg ; overflow hidden ; background --n-2
                      transition border-color + background 160 ms ease-out
.unit[open]           border-color --e-tint-line          ← "the one you are in"
.unit + .unit         margin-block-start 16 px
.unit__head           flex ; gap 12 px ; width 100 % ; padding 16 px
                      background --n-3 ; text-align start ; cursor pointer
                      transition background 160 ms ease-out
                      list-style none ; ::marker cleared ; ::-webkit-details-marker hidden
.unit[open] > head    background --e-tint
.unit__head:hover     background --n-4
.unit[open]>head:hov  background = mix(--e-tint, --e-stage 8%)  → #F7E6E1 light / #351209 dark
.unit__head:focus-visible  outline-offset −3 px  ← INSIDE the box, because the parent clips
.unit__title          flex 1 ; min-inline-size 0 ; --fs-title-4 ; weight 500 ; --n-12
.unit__sub            block ; --fs-text-sm ; weight 400 ; --n-11
.unit__count          mono ; tabular-nums ; --fs-mono-label ; colour --e-ink
.unit__chevron        colour --e-ink ; transition transform 160 ms ease-out
                      rotate(180deg) when open
.unit__toggle         flex centred ; padding 4 px ; radius --r-xs ; transparent
.unit__body           padding 8 px
```

Two open-state selectors exist because there are two kinds of unit: the student outline is a real
`<details>`; the admin section card is a hand-built disclosure marking state with `data-open`
(interactive content inside a `<summary>` is invalid and keyboard-unreachable).

### 3.23 `.lesson-row` — a lesson with its action at the inline end (`study.css:1040`)

```
.lesson-row            relative flex ; align-items center ; gap 12 px ; padding 12 px
                       radius --r-md ; transition background 160 ms ease-out
      :hover           background --n-2
      ≤30rem           flex-wrap wrap ; row-gap 8 px
                       .lesson-row__text  flex-basis calc(100% − 3.25rem)
                       > .chip / > .course-entry  margin-inline-start 3.25rem (52 px)
.lesson-row__well      36 × 36 px ; radius --r-md ; background --e-tint ; colour --e-ink
.lesson-row__text      flex 1 ; min-inline-size 0
.lesson-row__title     block ; --fs-text-sm ; --n-12 ; overflow-wrap anywhere   ← WRAPS, never truncates
.lesson-row__meta      block ; mono ; tabular-nums ; --fs-mono-label ; --n-11
```

Well states — **hue is never spent on "done"**:

| State | Well |
|---|---|
| `--done` | background **transparent**, `inset 0 0 0 1px --e-tint-line`, colour `--e-ink` |
| `--locked` | background `--n-3`, colour `--n-9`; title colour `--n-11` |
| `--new` | ordinary ember fill **+** an 8px unfilled dot at the corner: `inset-block-start −2px; inset-inline-end −2px; background --n-1; border 1px --n-8; box-shadow 0 0 0 2px --n-1` (ring follows hover → `--n-2`) |
| `--started` | same dot, filled `--a-9` |
| `--quiz` | indented via `margin-inline-start` (the indent IS the sentence: this is the check on the row above, not the next step) |

> *"A finished lesson is NOT green, and this is the rule the whole palette rests on: `--ok` means
> 'the quiz marked this right'… So a cleared lesson is marked by WEIGHT, not by hue."*
> The row also says «خلصت» in words, which is what carries the state to a screen reader.

### 3.24 `.attempt-row` — an exam sitting (`study.css:2161`)

```
relative flex ; gap 12 px ; padding 12 px ; 1px --border ; radius --r-lg ; background --n-1
transition background + border-color 160 ms ease-out ; hover background --n-2
__well  36 × 36 px ; radius --r-md ; background --e-tint ; colour --e-ink
__title block ; --fs-text-sm ; weight 500 ; --n-12 ; overflow-wrap anywhere
__meta  block ; mono ; tabular-nums ; --fs-mono-label ; --n-11
≤30rem  flex-wrap ; row-gap 8 px ; text flex-basis calc(100% − 3.25rem) ;
        > .chip, > .verdict margin-inline-start 3.25rem
```

`--counts` / `--action` (two claims, one treatment): border `--a-9` @45%, background
`mix(--a-9 6%, --n-1)`, hover `mix(--a-9 10%, --n-1)`, well becomes `--a-9` with `#1A1206` ink.

### 3.25 `.verdict` — passed / failed, right / wrong (`study.css:2255`)

**The ONLY green and red in the study surface.** Both carry their word as well as their hue.

```
inline-flex ; gap 4 px ; height 32 px ; padding-inline 12 px ; radius --r-sm
--fs-text-sm ; weight 500 ; white-space nowrap
--pass  background mix(--ok 12%, --n-1)  ring inset 0 0 0 1px mix(--ok 35%, transparent)  colour --ok
--fail  background mix(--err 12%, --n-1) ring inset 0 0 0 1px mix(--err 35%, transparent) colour --err
```

Pre-computed backgrounds: pass `#EEE7DB` light / `#0D191F` dark; fail `#F6E6D8` light / `#0F1521` dark.

### 3.26 `.empty` + `.spot` — the empty state (`study.css:2997` / `:2956`)

```
.empty         padding 24 px 20 px ; 1px --e-tint-line ; radius --r-lg
               background --e-tint ; text-align center
.empty__title  --fs-text-base ; weight 500 ; --n-12
.empty__body   margin-top 4 px ; --fs-text-sm ; --n-11
.empty__action margin-top 16 px
```

> *"Ember-tinted rather than a dashed grey rectangle… an empty container is STRUCTURE, and a dashed
> grey box is indistinguishable from something that failed to load."*

`.spot` — the drawing inside it: `120 × 84 px` (`7.5rem × 5.25rem`), centred, `margin-bottom 12px`.
SVG part classes:

| Class | Paint |
|---|---|
| `.spot__ground` | stroke `--e-tint-line`, width 2, round cap |
| `.spot__solid` | fill `--e-tint`, stroke `--e-tint-line`, width 1.5 |
| `.spot__line` | fill none, stroke `--e-tint-line`, width 1.5 |
| `.spot__mark` | stroke `--e-tint-line`, width 2, round cap |
| `.spot__accent` | fill `--a-9` @ 22%, stroke `--a-9`, width 1.5 |
| `.spot__accent-fill` | fill `--a-9` |
| `.spot__accent-glyph` | fill none, stroke `#1A1206`, width 2.5, round cap + join |

**Exactly one amber element per drawing.** Three empty states can be on the dashboard at once for a
brand-new student.

### 3.27 `.group-head` — the rule-and-label that opens a group of cards (`study.css:1967`)

```
flex ; align-items center ; gap 12 px
padding-block-end 8 px ; margin-block-end 16 px ; border-block-end 1px --border
__mark   4 × 20 px (0.25rem × 1.25rem) ; radius 999 px ; background --e-stage
__title  --fs-title-3 ; weight 500 ; --n-12
__note   --fs-text-sm ; --n-11
__count  margin-inline-start auto ; mono ; --fs-mono-label ; colour --e-ink
```

### 3.28 `.study-head` — the page header every study route opens with

`margin-block-end 24px`; `__title` `--fs-title-1` / `--lh-title-1` / weight 600 / `--n-12`;
`__lead` `margin-top 8px`, `max-width --w-prose`.

### 3.29 `.aside-card` — a card with a drawn banner (`study.css:1816`)

```
.aside-card       overflow hidden ; 1px --border ; radius --r-lg ; background --n-2
.aside-card__art  block ; width 100 % ; height auto ; aspect-ratio 16 / 6 ; background --e-art
.aside-card__body padding 16 px
.aside-card__title / __note   see study.css:1912 / :1930
```

`--e-art`, not `--e-tint` — a banner is looked AT.

### 3.30 `.runner-*` — the quiz runner (`study.css:2584+`)

```
.runner-card    padding 20 px  (24 px from 48rem) ; 1px --border ; radius --r-lg ; background --n-1
.runner-option  flex ; align-items flex-start ; gap 12 px ; padding 12 px 16 px
                1px --border ; radius --r-md ; background --n-1 ; cursor pointer
                transition background + border-color 160 ms ease-out
      :hover              border --border-strong ; background --n-2
      :has(:checked)      border --a-9 ; background mix(--a-9 8%, --n-1)
                          → #FDF5ED light / #0D1519 dark
      :has(:disabled)     cursor not-allowed ; opacity 0.60
.runner-foot    flex wrap ; justify-content space-between ; gap 12 px
                padding-block-start 16 px ; border-block-start 1px --border
.runner-nav     padding 16 px ; 1px --border ; radius --r-lg ; background --n-1
                ≥64rem: position sticky ; inset-block-start 24 px
.runner-nav__title  margin-bottom 12 px ; --fs-text-sm ; weight 500 ; --n-12
.runner-nav__grid   flex wrap ; gap 8 px
.runner-nav__legend margin-top 12 px ; mono ; --fs-mono-label ; --n-10
.nav-chip       36 × 36 px FIXED (2.25rem)  →  44 × 44 px BELOW 47.999rem
                radius --r-sm ; 1px --border ; background --n-1
                mono ; tabular-nums ; --fs-text-sm ; colour --n-10
                transition background + border-color + color 160 ms ease-out
```

> The question map's three states are told apart **by weight and fill, never by hue**: this grid sits
> two clicks from a screen where green and red mean right and wrong, and a red "unanswered" chip
> would read as a mark.
> The nav chip goes to the **full 44px in both axes** on phone — *"a chip is a wide pill you can hit
> anywhere along its length and a nav chip is a square."*

### 3.31 `.theme-pill` — the theme control (`globals.css:395+`)

One control on every surface, driven by three custom properties so a surface retunes it in one place.

```
--pill-pad  --pill-icon  --pill-gap        where
0.25rem     1.625rem     0.125rem          base (marketing header)   → 64 × 36 px
0.3125rem   1.875rem     0.25rem           .topbar__actions (desktop)
0.375rem    2rem         0.25rem           .topbar__actions ≤47.999rem → 80 × 44 px
0.375rem    2rem         0.25rem           .site-nav ≤30rem
0.1875rem   —            —                 (sections.css:426, a narrow marketing case)

.theme-pill        relative inline-flex ; align-items center ; gap --pill-gap ; padding --pill-pad
                   radius --r-full ; 1px --border-strong
                   background --p-500 @ 10 %   (i.e. #F28318 @ 10 %)
                   colour --n-11 ; cursor pointer
                   transition border-color 160 ms var(--ease)
      :hover       border-color --a-9
.theme-pill__knob  absolute ; top/bottom = --pill-pad ; width = --pill-icon
                   radius --r-full ; background --a-9
                   transition transform 0.3 s var(--ease-pop)
                   [data-mode=light] inset-inline-start: --pill-pad ; end auto
                   [data-mode=dark]  inset-inline-start: auto ; end: --pill-pad
.theme-pill__icon  relative z-index 1 ; grid place-items-center ; --pill-icon square
                   border-radius 50 % ; transition color 0.3 s var(--ease)
                   the LIT one (sun in light, moon in dark) gets colour #1A1206
```

Icons: `lucide-react` `Sun` and `Moon`, `size={14} strokeWidth={2.4}`
(`apps/web/components/theme-toggle.tsx`). Sun is the **first** icon, so under RTL it occupies the
inline-start (right) half.

### 3.32 `.brand` — the product wordmark (`globals.css`)

```
.brand              inline-flex ; align-items center ; gap 10 px
.brand__mark        38 × 38 px ; radius 11 px ; grid place-items-center
                    background --a-9 ; colour #1A1206
                    mono ; 13 px ; weight 600 ; letter-spacing 0
.brand__mark--photo radius 50 % ; overflow hidden ; background transparent ; 1px --n-6
                    (on data-tone="ink": border rgb(255 255 255 / 0.25))
                    img: block ; 100 % ; object-fit cover
.brand__text        flex column ; min-width 0   (hidden when data-compact="true")
.brand__name        16 px ; weight 600 ; line-height 1.3 ; text-wrap balance ; colour --n-12
                    (data-tone="ink" → #fff)
.brand__tag         12 px ; line-height 1.45 ; colour --n-11
                    (data-tone="ink" → rgb(255 255 255 / 0.62))
```

`text-wrap: balance` is load-bearing — «المهندس أيمن أبو العلا» does not fit the rail's ~176px text
column and unbalanced it broke as a four-word line plus a one-word orphan.

### 3.33 `UserAvatar` — `apps/web/components/app/user-avatar.tsx`

```
shared classes : shrink-0 rounded-full border 1px --border object-cover
size           : caller-supplied px (passed to the image optimizer too)
fallback       : the same round bordered box, background --n-4 (surface-4),
                 colour --n-11, font-weight 600, font-size round(size * 0.36), initials
```

The fallback is the **common case**, not the edge case — an email/password account never has an
avatar. A dead Google URL and a missing one must render identically.

### 3.34 `.stream-chip` / `.emphasis__chip` — small labels (`globals.css`)

```
inline-block ; padding-block 1 px ; padding-inline 7 px
1px --border ; radius 6 px (0.375rem)
background --n-2 ; colour --n-11
--fs-text-xs ; font-weight 600 ; line-height 1.5 ; white-space nowrap
```

Variants: `.stream-chip--languages` and `.emphasis__chip--required` → border `--e-tint-line`,
background `--e-tint`, colour `--e-ink`. `.emphasis__chip--optional` → transparent background,
colour `--n-10`, border kept.

⚠️ **weight 600, not 500, and it is a performance decision.** These chips were the only weight-500
text on the public site, and weight 500 is a whole extra 44 KB Arabic face. Traced on a Pixel-7 at
4× CPU throttle / Fast 3G: CSS done at 1.01 s, hero image at 1.80 s, eight font files running
1.06 s → 4.35 s, LCP not firing until 3.88 s. **The bytes were not the problem; the queue was.**
Do not "tidy" this back to `--fw-medium`.

`.emphasis` wrapper: `inline-flex flex-wrap items-baseline; column-gap 6px; row-gap 2px`.
`.emphasis__note` / `.stream-warning`: `--fs-text-xs`, colours `--n-10` / `--warn`.

### 3.35 `.stat-tile` / `.section-tile` (admin, `admin.css:478` / `:533`)

```
.stat-tile              flex ; align-items center ; gap 16 px ; padding 16 px 20 px
.stat-tile__well        grid place-items-center ; 44 × 44 px ; radius --r-lg
                        1px --e-ink @ 30 % ; background --e-ink @ 12 % ; colour --e-ink
.stat-tile__value       --fs-title-1 ; weight 600 ; line-height 1 ; --n-12 ; tabular-nums
.stat-tile__label       margin-top 4 px ; --fs-text-sm ; --n-11
.stat-tile--waiting     border --a-9 @ 38 % ; background --a-9 @ 8 %
                        well: border --a-9 @ 42 %, bg --a-9 @ 20 %, colour --a-11
                        value colour --a-11
                        ⚠️ only rendered when the count is above zero

.section-tile           flex ; align-items flex-start ; gap 12 px ; padding 16 px ; height 100 %
.section-tile__well     grid place-items-center ; 36 × 36 px ; radius --r-md
                        1px --e-ink @ 28 % ; background --e-ink @ 10 % ; colour --e-ink
                        transition bg + border + colour 160 ms var(--ease)
      :hover            border --a-9 @ 42 % ; background --a-9 @ 18 % ; colour --a-11
.section-tile__title    weight 500 ; --n-12
.section-tile__note     margin-top 2 px ; --fs-text-sm ; --lh-text-sm ; --n-11
.section-tile__go       margin-inline-start auto ; --n-10 ; opacity 0 → 1 on hover/focus
```

### 3.36 `.row-actions` (admin, `admin.css:30`)

`flex; align-items center; gap 4px`. `.row-actions__sep` is a **1px × 20px** `--border` divider with
`margin-inline: 4px`. The destructive action sits past that hairline and stays colourless until
hover — *"reachable in one click, never the first thing the eye lands on."*

### 3.37 Toasts

`apps/web/components/toaster.tsx` — a single `sonner` `<Toaster dir="rtl" position="bottom-center"
containerAriaLabel={copy.a11y.toastRegionLabel} />` mounted **once**, in the root layout.
No custom styling is applied, so sonner's own default toast geometry is what ships.
For Flutter: bottom-centre, RTL, one host.

### 3.38 Route progress bar

`apps/web/components/motion/route-progress.tsx` — `@bprogress/next` `<ProgressProvider height="2px"
color="var(--a-9)" options={{ showSpinner: false }} shallowRouting />`.
`globals.css` corrections: `.bprogress .bar { z-index: 60 }` (above the sticky header, below modals)
and `.bprogress .peg { display: none }` (the peg is a gradient, and *"this product ships no
gradients"* on interactive chrome).

**A 2px amber bar at the top of the viewport, no spinner, linear easing.**

### 3.39 `ProgressRing` — `apps/web/components/progress-ring.tsx`

```
default size 44 px
stroke  = max(2, round(size * 0.09))
radius  = (size - stroke) / 2
track   tone="surface" → --n-4 (stroke-surface-4)
        tone="ink"     → rgb(255 255 255 / 0.20)
arc     --a-9  (amber — "amber marks where you ARE")
```

### 3.40 Decorative page layers

| Class | Geometry |
|---|---|
| `.dot-grid` | `position: fixed; inset: 0; z-index: -1; pointer-events: none`. Two offset radial-gradient dot layers on a **24 × 24 px** grid: `circle at 1px 1px` at `--n-12` @ **4%**, and `circle at 13px 13px` at `--n-12` @ **2%**. Masked by `radial-gradient(420px circle at var(--mx,50%) var(--my,30%), #000 0%, transparent 100%)` following the cursor. |
| `.app-bloom` | `position: fixed; inset-block-start: 0; inset-inline: 0; height: 420px; z-index: -1`. `radial-gradient(90% 100% at 70% 0%, --a-9 @ 6% 0%, transparent 70%)`. The page's **one** decorative layer. |
| `.hero-bloom::before` | `absolute inset-0; z-index: -1`. `radial-gradient(120% 140% at var(--bloom-x, 88%) 0%, --a-9 @ 6% 0%, transparent 60%)`. |
| `.topbar` | `background: --n-1`. **Only under `@media (pointer: fine)`** it becomes `--n-1` @ 80% + `backdrop-filter: blur(20px)`. |

> `backdrop-filter: blur(20px)` on a sticky full-width element is *"the most expensive single
> declaration in this product… on a low-end Adreno or Mali, which is what this platform is read on,
> that is a large part of why «الموقع بيلاج»."* The phone gets an **opaque** bar. Gated on
> `(pointer: fine)` — the DEVICE — not on a width breakpoint.
> ⚠️ `prefers-reduced-motion` is **not** the lever for this: `motion.css` zeroes animations and
> transitions, and `backdrop-filter` is neither.

**For Flutter: do not use a `BackdropFilter` on the app bar on phones.** Paint it opaque `--n-1`.

### 3.41 Shell layout

```
.shell                    min-height 100 dvh
≥768 px                   display grid ; grid-template-columns: var(--rail-w) minmax(0, 1fr)
                          collapsed → var(--rail-w-collapsed) minmax(0, 1fr)
                          transition grid-template-columns 160 ms var(--ease-out)
                          (only under prefers-reduced-motion: no-preference)
≤47.999 px                .shell main { padding-block-end: 5.5rem }   ← 88 px reserved for
                          the assistant launcher's corner
Rail                      <aside class="hidden border-e border-line bg-surface-2 md:block">
                          inner: sticky top-0, h-dvh, flex-col, gap 16 px, padding 12 px
Topbar                    <header class="topbar sticky top-0 z-40 border-b border-line">
                          inner div: h-[var(--topbar-h)] = 56 px, px 16 (24 from md)
≤47.999 px                .topbar__actions > * { min-block-size: 44 px; min-inline-size: 44 px }
```

The rail column comes **first** in `grid-template-columns`, which in a logical grid means the inline
start = the **right** edge in RTL. There is no `left`/`right` anywhere and none is needed.

Collapse is CSS-only, driven by two attributes: `html[data-rail='collapsed']` (the student's
preference, applied pre-paint) and `.shell[data-rail-forced='true']` (the route's override — the
lesson player already draws its own outline sidebar). **Every collapse rule is inside
`@media (min-width: 48rem)`** — the attribute travels to the phone where the same classes build the
navigation *sheet*, and unguarded it shipped a drawer with six icons and no words.

### 3.42 Assistant dock (المساعد)

```
--assistant-inset          1 rem  (0.5 rem ≤30 rem)      distance from the inline END (LEFT in RTL)
--assistant-launcher-h     3.5 rem = 56 px
--assistant-launcher-inset 1.5 rem = 24 px
--assistant-stack-gap      0.75 rem = 12 px
--assistant-below          = inset + launcher-h + gap  = 92 px
--assistant-above          1 rem

.assistant-dock   inset-inline-end: --assistant-inset ; inset-inline-start: auto
                  transform-origin: bottom left   ([dir=ltr] → bottom right)
                  z-index 70
.assistant-launcher  bottom: --assistant-launcher-inset
.assistant-panel     bottom: --assistant-below
                     width : min(25rem, 100vw − 2 × inset)
                     max-h : min(38rem, 100dvh − below − above)
≤30 rem  the panel becomes a full-bleed SHEET bound to the VISUAL viewport:
         top: var(--assistant-vv-top, 0px) ; height: var(--assistant-vv-height, 100dvh)
         bottom auto ; max-height none ; inset-inline 0 ; width auto
         border-radius 0 ; border-inline-width 0 ; border-block-end-width 0
         .assistant-launcher[data-panel-open="true"] { display: none }
```

⚠️ The keyboard note is worth porting: an earlier version lifted the panel by the measured keyboard
height. On iOS, Safari pins fixed elements to the **layout** viewport and then scrolls that viewport
to reveal the focused field, so the ground moves under an offset computed against where it used to
be. It measured perfectly in an emulator and «بتضرب خالص» on a real phone. The fix was to bind to
`visualViewport` and place the sheet where the visible rectangle actually **is**.

### 3.43 `MediaKeyField` / dropzone (`globals.css`)

```
.media-key              flex ; align-items center ; gap 12 px ; wrap ; padding 8 px
                        1px DASHED --border ; radius --r-md
                        transition border-color + background 160 ms ease-out
.dropzone--active,
.media-key--dropping    border-color --a-9 ; background --a-9 @ 12 % (oklab mix w/ transparent)
.media-key__preview     relative ; flex none ; width min(18rem, 100 %) ; aspect-ratio 16 / 9
                        grid place-items-center ; overflow hidden
                        1px --border ; radius --r-md ; background --n-2
.media-key__empty       padding-inline 16 px ; --fs-text-sm ; --n-10 ; centred ; text-wrap balance
.media-key__progress    absolute ; inset-inline 0 ; inset-block-end 0 ; height 4 px
                        background --n-12 @ 25 %
.media-key__bar         block ; height 100 % ; background --a-9 ; transition inline-size 120 ms linear
.media-key__actions     flex wrap ; align-items center ; gap 8 px
```

The dashed edge is *"the ONLY affordance a drag has"* — a pointer carrying a file gets no hover, no
cursor change and no tooltip.

### 3.44 Payment / subscribe panel (`globals.css:1950+`)

The full set, because it is a screen a student sees at the moment of paying:

```
.course-start                margin-top 1.25 rem  (0 inside .enrolled-course-card__book)
.course-start__note          margin-top 0.625 rem ; centred ; --fs-text-sm ; --n-11
.course-start__error         same, colour --err
.course-subscribe            flex column ; gap 0.875 rem ; padding 1 rem
                             radius 0.875 rem ; 1px --border ; background --n-2
.course-subscribe__title     weight 600 ; centred
.course-subscribe__plans     grid ; 2 columns ; gap 0.625 rem
                             an :only-child / :last-child:nth-child(odd) spans 1 / -1
.course-subscribe__plan-card flex column centred ; gap 0.375 rem ; padding 1 rem 0.75 rem
                             radius 0.875 rem ; 1.5 px --border ; background --n-2 ; centred
                             transition border-color + background 160 ms ease-out,
                                        transform 120 ms ease-out
      :hover                 border --a-9 ; background --a-9 @ 8 %
      :active                transform scale(0.98)
.course-subscribe__plan-icon 44 × 44 px ; radius 999 px ; background --a-9 @ 12 % ; colour --a-9
.course-subscribe__plan-name --fs-text-base ; weight 600 ; --n-12
.course-subscribe__plan-price --fs-text-sm ; weight 500 ; --n-11
.course-subscribe__amount    --fs-title-2 ; weight 700 ; colour --a-9 ; centred
.course-subscribe__brand     height 1.75 rem ; width auto ; margin-bottom 0.5 rem
.course-subscribe__number-row flex ; space-between ; gap 0.75 rem ; padding 0.625 rem 0.875 rem
                             radius 0.625 rem ; 1px --border ; background --n-1
.course-subscribe__number    --fs-text-lg ; weight 600 ; letter-spacing 0.02 em
.course-subscribe__copy      --fs-text-sm ; colour --a-9 ; weight 600
.course-subscribe__hint      margin-top 0.375 rem ; --fs-text-xs ; --n-11
.course-subscribe__upload    flex column centred ; gap 0.625 rem ; width 100 % ; MIN-HEIGHT 8 rem
                             margin-top 0.375 rem ; padding 1.25 rem 1 rem ; radius 0.875 rem
                             2 px DASHED --a-9 @ 55 % ; background --a-9 @ 6 % ; colour --n-11
      :hover                 border --a-9 ; background --a-9 @ 12 %
      :disabled              opacity 0.6
.course-subscribe__upload-icon    56 × 56 px ; radius 999 px ; 1.5 px --a-9 @ 45 %
                                  background --n-2 ; colour --a-9 ; --fs-title-2 ; weight 600 ; lh 1
.course-subscribe__upload-preview 80 × 80 px ; radius 0.625 rem ; object-fit cover ; 1px --border
.course-subscribe__upload-text    ellipsis nowrap ; --fs-text-base ; weight 500 ; --n-12
.course-subscribe__upload-change  --fs-text-sm ; weight 600 ; colour --a-9
.course-subscribe__actions   flex ; align-items center ; gap 1 rem
.course-subscribe__cancel    --fs-text-sm ; --n-11
.course-subscribe__error     centred ; --fs-text-sm ; --err
.course-subscribe__loading   centred ; --fs-text-sm ; --n-11
```

Status blocks (all `padding 0.875rem` or `0.75rem 0.875rem`, `radius 0.625rem`, `--fs-text-sm`):

| Block | Border | Background | Text |
|---|---|---|---|
| `__success` / `__pending` | `oklch(0.68 0.16 150)` @ 38% | same @ 10% | `oklch(0.48 0.14 150)` = `#00722E` light; `oklch(0.82 0.14 150)` = `#7CDD93` dark |
| `__rejected` | `--err` @ 38% | `--err` @ 8% | `--err` |
| `__lapsed` | `--warn` @ 38% | `--warn` @ 8% | `--warn` |

Note `__success`/`__pending` hard-code the **dark-mode** green literal in both themes for the border
and background and only swap the text colour — a deliberate exception.

### 3.45 `.stream-field` — segmented radios (`globals.css`)

Real `<input type="radio">` under the labels, not buttons with state.

```
.stream-field           border 0 ; padding 0 ; margin 0 ; min-inline-size 0
.stream-field__legend   margin-bottom 0.375 rem ; --fs-text-sm ; weight 500 ; --n-12
.stream-field__options  flex wrap ; gap 0.375 rem
.stream-field__option   inline-flex ; align-items center ; gap 0.375 rem
                        padding 0.3125 rem 0.625 rem ; 1px --border ; radius 0.5 rem
                        background --n-1 ; --fs-text-sm ; cursor pointer
      :hover            border-color --border-strong
      :has(input:checked)        border --e-tint-line ; background --e-tint ;
                                 colour --e-ink ; weight 500
      :has(input:focus-visible)  outline 2 px solid --e-ink ; outline-offset 2 px
.stream-field__hint     margin-top 0.375 rem ; --fs-text-sm ; --n-11
```

---

## 4. Motion

### 4.1 Easing curves — `packages/ui/src/tokens/motion.css` + `packages/ui/src/tokens/tokens.ts`

Curves are from GitHub Primer; durations measured from Linear / Vercel / Stripe.
**BOTH themes.**

| Token | cubic-bezier | Flutter `Cubic` | Use |
|---|---|---|---|
| `--ease-linear` | `0, 0, 1, 1` | `Curves.linear` | **progress bars and loaders only** |
| `--ease` | `0.25, 0.1, 0.25, 1` | `Cubic(0.25, 0.1, 0.25, 1)` | hover, micro-interactions |
| `--ease-out` | `0.3, 0.8, 0.6, 1` | `Cubic(0.3, 0.8, 0.6, 1)` | **DEFAULT** — anything entering or exiting |
| `--ease-in-out` | `0.6, 0, 0.2, 1` | `Cubic(0.6, 0, 0.2, 1)` | anything moving or morphing **in place** |
| `--ease-pop` | `0.175, 0.885, 0.32, 1.1` | `Cubic(0.175, 0.885, 0.32, 1.1)` | popovers — the trailing **1.1 is a deliberate slight overshoot** |

### 4.2 Durations

| Token | ms | Motion (`variants.ts`) seconds |
|---|---|---|
| `--d-hover` | **160** | `SECONDS.hover = 0.16` |
| `--d-popover` | **200** | `SECONDS.popover = 0.2` |
| `--d-modal` | **300** | `SECONDS.modal = 0.3` |
| `--d-exit` | **120** | `SECONDS.exit = 0.12` |

**Exits are always faster than entrances.** Nothing animates longer than **400 ms** — enforced
statically by `packages/config/eslint/rules/no-layout-animation.js`: *"Past that a transition reads
as lag."*

### 4.3 Named `@keyframes`

| Name | Where | Definition | Applied to |
|---|---|---|---|
| `shimmer` | `motion.css` + `globals.css` | `100% { transform: translateX(100%) }` | `Skeleton::after`, `1.8s infinite 180ms delay` |
| `route-fade-in` | `globals.css` | `from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none }` | `.route-fade`, **220 ms `var(--ease-out)` both** — the signed-in page transition. 4px, not 12: *"a large rise turns every navigation into an event, and this happens on every click in the rail."* |
| `robot-float` | `globals.css` | `0%,100% translateY(0); 50% translateY(-1.4px)` | `.robot__head`, **3.6 s ease-in-out infinite** |
| `robot-ember` | `globals.css` | `0%,100% { opacity:.5; scale(.82) } 50% { opacity:1; scale(1) }` | `.robot__ember`, **2.4 s ease-in-out infinite** (3.6 s + opacity .65 when `--stuck`) |
| `robot-blink` | `globals.css` | `0%,90% scaleY(1); 92% .12; 94% 1; 96% .12; 98%,100% 1` | `.robot__eyes`, **5.2 s `steps(1, end)` infinite** — a double blink, held not interpolated (*"a blink that eases is a droop"*) |
| `robot-giggle` | `globals.css` | `0%,100% none; 30% translateY(-1.6px) rotate(-3.5deg); 70% translateY(-.6px) rotate(3.5deg)` | `.robot-host:hover/:focus-visible .robot__head`, **620 ms ease-out infinite** |
| `robot-sway` | `globals.css` | `0%,100% rotate(-4deg); 50% rotate(4deg)` | `.robot--stuck .robot__head`, **4.4 s ease-in-out infinite** |
| `robot-thinking` | `globals.css` | `0%,100% { opacity:.28; translateY(0) } 40% { opacity:1; translateY(-1.6px) }` | `.robot--stuck .robot__dots circle` **and** `.ask-dots span` — **1.5 s ease-in-out infinite**, children delayed **180 ms** and **360 ms** |
| `ask-caret` | `globals.css` | `0%,49% opacity 1; 50%,100% opacity 0` | `.ask-caret`, **1.05 s `steps(1, end)` infinite** — snaps like a terminal cursor |

⚠️ The three robot idle loops are wrapped in `@media (pointer: fine)`. They animate transforms and
opacity on children **inside an `<svg>`**, and Blink does not promote SVG child transforms to the
compositor the way it does HTML ones — so each repainted the SVG on the main thread forever, on every
signed-in page. **On a phone the robot is static.** Port that: no idle animation on the mascot on
mobile.

### 4.4 Motion presets — `packages/ui/src/motion/variants.ts`

Plain data, no `motion` import; unit-tested against `tokens.ts` so CSS and JS cannot drift.

| Preset | initial | animate | exit |
|---|---|---|---|
| `popover` | `{opacity:0, scale:0.96}` | `{opacity:1, scale:1}` 200 ms `EASE_POP` | `{opacity:0, scale:0.96}` 120 ms `EASE_OUT` |
| `modal` | `{opacity:0, scale:0.98, y:8}` | `{opacity:1, scale:1, y:0}` 300 ms `EASE_OUT` | `{opacity:0, scale:0.98, y:4}` 120 ms `EASE_OUT` |
| `fadeUp` | `{opacity:0, y:12}` | `{opacity:1, y:0}` 300 ms `EASE_OUT` | — |
| `heroLcpSafe` | `{y:14}` — **no `opacity` key, by design** | `{y:0}` 300 ms `EASE_OUT` | — |
| `staggerParent` | `{}` | `{transition:{staggerChildren:0.06, delayChildren:0.04}}` | — |
| `staggerChild` | `{opacity:0, y:10}` | `{opacity:1, y:0}` 160 ms `EASE_OUT` | — |

> `scale(0.96) + opacity` is *"the highest-ROI motion detail in the whole design system."*
> `heroLcpSafe` has **no opacity** because Motion server-renders `initial` into inline style: an
> `opacity: 0` initial ships invisible text and is a direct LCP regression. Translate only,
> **above the fold**.
> `staggerParent` is *"the parent of the ONE orchestrated scroll moment a page is allowed."*

`MotionTarget`'s keys are an **allowlist** of composited properties only —
`opacity, scale, scaleX, scaleY, x, y, rotate`. A preset that animates `width`, `top` or `filter`
fails to compile.

### 4.5 Reduced motion

`packages/ui/src/tokens/motion.css` — the global backstop:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Plus `<MotionConfig reducedMotion="user">` in `apps/web/components/motion/motion-provider.tsx`,
which removes transforms and layout animations **while PRESERVING opacity fades** — *"that
combination — not 'disable everything' — is the vestibular-safe behaviour."*

**Flutter:** `MediaQuery.disableAnimationsOf(context)` (or `MediaQuery.of(context).disableAnimations`)
→ set durations to `Duration.zero` for transform-based animation, keep opacity crossfades.

### 4.6 Statically enforced motion rules — `packages/config/eslint/rules/no-layout-animation.js`

1. **Never animate a layout/paint property.** Banned → replacement:
   `width→scaleX`, `height→scaleY`, `min/max-*→scaleX/Y`, `top/bottom→y`, `left/right→x`,
   `inset→x/y`, `insetInlineStart/End→x`, `insetBlockStart/End→y`, `margin*→y`/`x`,
   `padding*→scale`, `filter→opacity`, `backdropFilter→opacity`, `boxShadow→opacity`,
   `borderWidth→opacity`, `fontSize→scale`, `lineHeight→scale`.
   `clipPath` is **deliberately allowed** — paint-only, used exactly once (the Shiki code reveal).
2. Only `m.*` from `motion/react`, never `motion.*` (`<LazyMotion strict>` throws on the latter).
3. Nothing over **400 ms**.

---

## 5. RTL

`<html lang="ar" dir="rtl">` — `apps/web/app/layout.tsx:91-95`. RTL is the **only** direction the
product ships; there is no English route yet, and the whole system is written so one can be added.

### 5.1 What is mirrored

* **Everything expressed with logical properties**, which is nearly all layout. The codebase bans
  physical Tailwind utilities via `packages/config/eslint/rules/no-physical-direction.js`:
  `ml-→ms-`, `mr-→me-`, `pl-→ps-`, `pr-→pe-`, `left-→start-`, `right-→end-`,
  `border-l→border-s`, `border-r→border-e`, `rounded-l/r→rounded-s/e`,
  `rounded-tl/tr/bl/br → rounded-ss/se/es/ee`, `text-left/right → text-start/end`,
  `float-left/right`, `clear-left/right`, `scroll-m*`, `scroll-p*`.
  *"a physical `ml-4` is correct in LTR and wrong in RTL, and the bug is invisible to anyone testing
  in English."*
* **Directional icons** — chevrons and arrows. One custom property, not a hardcoded `rotate-180`:

  ```css
  [dir='ltr'] { --dir-x: 1; }
  [dir='rtl'] { --dir-x: -1; }
  .icon-inline { transform: scaleX(var(--dir-x, 1)); }
  ```

  Call sites: `components/player/icons.tsx`, `components/app/rail-toggle.tsx`,
  `components/library/library-course-card.tsx`, `app/(app)/library/[slug]/page.tsx`,
  `components/playground/playground.tsx`, `app/(link)/links/page.tsx`.
  **In Flutter this is `Transform.scale(scaleX: -1)` or, better, `Icon(..., textDirection:)` /
  `Directionality`-aware icons; many Material icons already auto-mirror.**
* The shell's grid column order (rail first = inline start = **right**).
* The nav-pill's 3px current-page marker (`inset-inline-start: -0.75rem` = the right edge).
* The Sheet drawer (`start-0` = the right edge).
* `Switch`'s thumb travel — explicitly negated with `rtl:` variants because `translate-x` has no
  logical form.
* `Dialog`'s centring — `start-1/2` is logical but `-translate-x-1/2` is not, so
  `rtl:translate-x-1/2` counters it. Without that the dialog lands **off-screen**.
* The assistant panel's `transform-origin: bottom left` (flipped to `bottom right` under `[dir=ltr]`).
* `.assistant-dock` sits at the inline **end** = the **left** in RTL. Third position, third request,
  each by name; when it was at the start it landed on top of the navigation rail.

### 5.2 What is NOT mirrored — deliberately

| Thing | Why |
|---|---|
| `Skeleton`'s shimmer sweep | *"the sweep is decorative, not directional, so it is never mirrored"* |
| `.path-run__at`'s `translateX` wave | *"The trail is a decorative meander, not a directional cue… `--wave` is signed already, so a mirrored copy would just be the same shape shifted by half a period."* |
| `.stage::before`'s dot mask (`to right`) | The band is an RTL surface, the words start at its **right**, and the dots have to be absent there — so the physical `to right` is correct. `to var(--x)` is not valid CSS anyway (the `to <side>` keyword cannot come from a custom property), and the version that tried it never faded at all. |
| `.stage`'s radial highlight (`at 85% 0%`) | Same reason — the light falls from the side the reader starts on. |
| `.shiki` code blocks | `direction: ltr; text-align: left` — *"code is Latin script regardless of the page's `dir`… without this the root direction right-aligns every line and the horizontal-scroll direction flips, both of which read as broken."* |
| `.site-badge` | `direction: ltr` — a Latin badge set inside an RTL document; without it the leading dot and the words swap sides. |
| `.site-btn__arrow` hover nudge | `translateX(-0.1875rem)` — a physical −3px, which is "forward" in RTL. |

### 5.3 Portals need `dir` restated

Every Radix root that renders through a portal sets `dir="rtl"` **explicitly** —
`DialogContent`, `SheetContent`, `RadioGroup` (Radix reads `dir` for arrow-key semantics),
`DropdownMenu` **Root** (the Menu context reads it once at the top and every descendant, including
portalled Content, consumes it from there). A portal escapes the `<html dir="rtl">` ancestor.

Flutter equivalent: overlays/routes built via `Navigator` inherit `Directionality` from the app,
so this is free — but if you build an `Overlay` entry manually, wrap it in
`Directionality(textDirection: TextDirection.rtl, …)`.

### 5.4 Horizontal overflow

```css
html, body { overflow-x: clip; }   /* apps/web/app/globals.css @layer base */
.site       { overflow-x: clip; }  /* (site)/styles/theme.css */
```

`clip`, **not `hidden`** — `hidden` turns the element into a scroll container, which breaks
`position: sticky` on every descendant and makes `scrollIntoView` jump. Only the **inline** axis is
clipped; `overflow-y` stays visible.

Reported as «بقدر أسكرول يمين وشمال كده، وده مش صح في الموبايل».

Deliberate horizontal scrollers keep their own `overflow-x: auto` boxes: `TableWrapper`, `pre`,
`.shiki`, `.rail__viewport`.

**Flutter:** the page body must never scroll horizontally. Wide tables and code blocks get their own
`SingleChildScrollView(scrollDirection: Axis.horizontal)`.

---

## 6. Iconography

**Icon set: `lucide-react` v1.27.0** (`packages/ui/package.json`, `apps/web/package.json`).
There is no icon font and no custom SVG sprite. A handful of one-off SVGs are hand-drawn inline
(the dialog/sheet close X, the checkbox tick, `AssistantRobot`, `.spot__*` empty-state drawings,
`ExamGateMark`, `.card-art__*` banners, `.course-art__*` shapes).

Default rendering: lucide draws on a **24 × 24 viewBox**, `fill: none`, `stroke: currentColor`,
`stroke-width: 2`, round cap and join. The codebase sizes icons with Tailwind (`size-4` = 16px,
`size-5` = 20px, `size-3.5` = 14px) or a `size={n}` prop, and occasionally overrides
`strokeWidth` (the theme toggle uses `2.4`).

**Flutter equivalent:** `lucide_icons` / `lucide_icons_flutter` on pub.dev exposes the same set with
the same names — prefer it over hand-mapping to Material, because Material's stroke weight and
corner treatment are visibly different. The Material fallbacks below are for cases where you cannot
use lucide.

### Complete inventory of icons used, by frequency

Counted by parsing every `import { … } from 'lucide-react'` across `apps/web` and `packages`.

| Count | Lucide name | Closest Flutter/Material fallback |
|---|---|---|
| 10 | `UserRound` | `Icons.person_outline` |
| 9 | `ArrowLeft` | `Icons.arrow_back` (auto-mirrors) |
| 8 | `Send` | `Icons.send_outlined` |
| 8 | `Layers` | `Icons.layers_outlined` |
| 8 | `GraduationCap` | `Icons.school_outlined` |
| 7 | `RotateCcw` | `Icons.rotate_left` |
| 7 | `Clock` | `Icons.schedule` |
| 7 | `CheckCircle2` | `Icons.check_circle_outline` |
| 7 | `BookOpen` | `Icons.menu_book_outlined` |
| 6 | `Sparkles` | `Icons.auto_awesome_outlined` |
| 6 | `Plus` | `Icons.add` |
| 6 | `ChevronLeft` | `Icons.chevron_left` |
| 6 | `Check` | `Icons.check` |
| 5 | `X` | `Icons.close` |
| 5 | `Users` | `Icons.people_outline` |
| 5 | `Trophy` | `Icons.emoji_events_outlined` |
| 5 | `Trash2` | `Icons.delete_outline` |
| 5 | `Play` | `Icons.play_arrow` |
| 5 | `MessageCircle` | `Icons.chat_bubble_outline` |
| 5 | `ImagePlus` | `Icons.add_photo_alternate_outlined` |
| 5 | `ClipboardCheck` | `Icons.assignment_turned_in_outlined` |
| 5 | `ArrowRight` | `Icons.arrow_forward` (auto-mirrors) |
| 4 | `PackageOpen` | `Icons.inventory_2_outlined` |
| 4 | `NotebookPen` | `Icons.edit_note` |
| 4 | `Download` | `Icons.download_outlined` |
| 4 | `BookMarked` | `Icons.bookmark_border` |
| 4 | `Award` | `Icons.workspace_premium_outlined` |
| 3 | `Wallet` | `Icons.account_balance_wallet_outlined` |
| 3 | `Truck` | `Icons.local_shipping_outlined` |
| 3 | `Target` | `Icons.my_location` |
| 3 | `ShieldCheck` | `Icons.verified_user_outlined` |
| 3 | `Route` | `Icons.route_outlined` |
| 3 | `Repeat2` | `Icons.repeat` |
| 3 | `Phone` | `Icons.phone_outlined` |
| 3 | `MonitorSmartphone` | `Icons.devices_outlined` |
| 3 | `MessageCircleQuestion` | `Icons.help_outline` |
| 3 | `Loader2` | `CircularProgressIndicator` |
| 3 | `FileText` | `Icons.description_outlined` |
| 3 | `ClipboardList` | `Icons.assignment_outlined` |
| 3 | `ChevronDown` | `Icons.expand_more` |
| 3 | `CalendarClock` | `Icons.event_outlined` |
| 3 | `ArrowUpLeft` | `Icons.north_west` |
| 2 | `PlayCircle` | `Icons.play_circle_outline` |
| 2 | `Paperclip` | `Icons.attach_file` |
| 2 | `Newspaper` | `Icons.article_outlined` |
| 2 | `Moon` | `Icons.dark_mode_outlined` |
| 2 | `Menu` | `Icons.menu` |
| 2 | `Lock` | `Icons.lock_outline` |
| 2 | `LayoutDashboard` | `Icons.dashboard_outlined` |
| 2 | `Inbox` | `Icons.inbox_outlined` |
| 2 | `Home` | `Icons.home_outlined` |
| 2 | `Flag` | `Icons.flag_outlined` |
| 2 | `FileImage` | `Icons.image_outlined` |
| 2 | `ExternalLink` | `Icons.open_in_new` |
| 2 | `CornerUpRight` | `Icons.subdirectory_arrow_right` |
| 2 | `Copy` | `Icons.content_copy` |
| 2 | `Code2` | `Icons.code` |
| 2 | `Clock3` | `Icons.schedule` |
| 2 | `ChevronsLeft` | `Icons.keyboard_double_arrow_left` |
| 2 | `ChevronRight` | `Icons.chevron_right` |
| 2 | `Braces` | `Icons.data_object` |
| 2 | `Bot` | `Icons.smart_toy_outlined` |
| 2 | `BookOpenCheck` | `Icons.menu_book` + tick, or `Icons.fact_check_outlined` |
| 2 | `BarChart3` | `Icons.bar_chart` |
| 2 | `BadgeCheck` | `Icons.verified_outlined` |
| 2 | `ArrowUpDown` | `Icons.swap_vert` |
| 2 | `AlertTriangle` | `Icons.warning_amber_outlined` |
| 2 | `AlarmClock` | `Icons.alarm` |
| 1 | `Zap` | `Icons.bolt_outlined` |
| 1 | `XCircle` | `Icons.cancel_outlined` |
| 1 | `UserRoundCheck` | `Icons.how_to_reg_outlined` |
| 1 | `Undo2` | `Icons.undo` |
| 1 | `TrendingUp` | `Icons.trending_up` |
| 1 | `Terminal` | `Icons.terminal` |
| 1 | `Table2` | `Icons.table_chart_outlined` |
| 1 | `Sun` | `Icons.light_mode_outlined` |
| 1 | `Square` | `Icons.crop_square` |
| 1 | `Sprout` | `Icons.eco_outlined` |
| 1 | `Sparkle` | `Icons.auto_awesome` |
| 1 | `Sigma` | *(no Material equivalent — draw or use lucide)* |
| 1 | `ShoppingBag` | `Icons.shopping_bag_outlined` |
| 1 | `Settings` | `Icons.settings_outlined` |
| 1 | `ServerCrash` | `Icons.dns_outlined` |
| 1 | `ScrollText` | `Icons.receipt_long_outlined` |
| 1 | `School` | `Icons.school_outlined` |
| 1 | `RefreshCw` | `Icons.refresh` |
| 1 | `Pencil` | `Icons.edit_outlined` |
| 1 | `PenLine` | `Icons.mode_edit_outline` |
| 1 | `PackageX` | `Icons.remove_shopping_cart_outlined` |
| 1 | `PackageCheck` | `Icons.inventory_outlined` |
| 1 | `MoreHorizontal` | `Icons.more_horiz` |
| 1 | `Minus` | `Icons.remove` |
| 1 | `Microscope` | `Icons.biotech_outlined` |
| 1 | `Mic` | `Icons.mic_none` |
| 1 | `MessagesSquare` | `Icons.forum_outlined` |
| 1 | `MessageSquareText` | `Icons.chat_outlined` |
| 1 | `MessageSquareReply` | `Icons.reply` |
| 1 | `Megaphone` | `Icons.campaign_outlined` |
| 1 | `Medal` | `Icons.military_tech_outlined` |
| 1 | `LogOut` | `Icons.logout` |
| 1 | `ListTree` | `Icons.account_tree_outlined` |
| 1 | `ListFilter` | `Icons.filter_list` |
| 1 | `ListChecks` | `Icons.checklist` |
| 1 | `LineChart` | `Icons.show_chart` |
| 1 | `Lightbulb` | `Icons.lightbulb_outline` |
| 1 | `Leaf` | `Icons.spa_outlined` |
| 1 | `LayoutGrid` | `Icons.grid_view_outlined` |
| 1 | `Layers3` | `Icons.layers_outlined` |
| 1 | `Languages` | `Icons.translate` |
| 1 | `Landmark` | `Icons.account_balance_outlined` |
| 1 | `Images` | `Icons.photo_library_outlined` |
| 1 | `Hourglass` | `Icons.hourglass_empty` |
| 1 | `HeartPulse` | `Icons.monitor_heart_outlined` |
| 1 | `Globe2` | `Icons.public` |
| 1 | `Focus` | `Icons.center_focus_strong_outlined` |
| 1 | `FlaskConical` | `Icons.science_outlined` |
| 1 | `Eye` | `Icons.visibility_outlined` |
| 1 | `Eraser` | `Icons.ink_eraser_outlined` |
| 1 | `Dumbbell` | `Icons.fitness_center` |
| 1 | `CornerDownLeft` | `Icons.keyboard_return` |
| 1 | `Coins` | `Icons.paid_outlined` |
| 1 | `CircleHelp` | `Icons.help_outline` |
| 1 | `CircleCheckBig` | `Icons.check_circle_outline` |
| 1 | `CircleAlert` | `Icons.error_outline` |
| 1 | `ChevronsRight` | `Icons.keyboard_double_arrow_right` |
| 1 | `CheckSquare2` | `Icons.check_box_outlined` |
| 1 | `ChartColumn` | `Icons.bar_chart` |
| 1 | `Camera` | `Icons.photo_camera_outlined` |
| 1 | `CalendarRange` | `Icons.date_range_outlined` |
| 1 | `Calculator` | `Icons.calculate_outlined` |
| 1 | `Briefcase` | `Icons.work_outline` |
| 1 | `Brain` | `Icons.psychology_outlined` |
| 1 | `BellRing` | `Icons.notifications_active_outlined` |
| 1 | `BellOff` | `Icons.notifications_off_outlined` |
| 1 | `Bell` | `Icons.notifications_none` |
| 1 | `Atom` | *(no Material equivalent — use lucide)* |
| 1 | `ArrowDownLeft` | `Icons.south_west` |
| 1 | `ArchiveRestore` | `Icons.unarchive_outlined` |
| 1 | `Archive` | `Icons.archive_outlined` |

`type LucideIcon` is imported 6× as a type only.

### The subject glyphs (`apps/web/components/course-art.tsx` resolves these from `SubjectGlyph`)

`sigma` `Sigma` · `atom` `Atom` · `flask` `FlaskConical` · `leaf` `Leaf` · `braces` `Braces` ·
`pen` `PenLine` · `languages` `Languages` · `landmark` `Landmark` · `globe` `Globe2` ·
`brain` `Brain` · `moon` `Moon` · `microscope` `Microscope` · `calculator` `Calculator` ·
`briefcase` `Briefcase` · `heart` `HeartPulse` · `trending` `TrendingUp` · `chart` `ChartColumn` ·
`book` `BookOpen`.

### Hand-drawn SVGs you must reproduce

| Where | Path data |
|---|---|
| Dialog / Sheet close | `viewBox="0 0 16 16"`, `M3 3l10 10M13 3 3 13`, stroke-width `1.75`, round cap, `fill: none`, `size-4` (16px) |
| Checkbox tick | `viewBox="0 0 16 16"`, `M3 8.5 6.5 12 13 4.5`, stroke-width `2`, round cap + join, `size-3` (12px), colour `#1A1206` |
| `AssistantRobot` | `apps/web/components/assistant/assistant-robot.tsx` + `.robot__*` rules in `globals.css`; sized by `--robot-size` (1.75 rem default, 28 px topbar, 96 px error screen). Visor fill `#0B0D10` in **both** themes. Ember + eyes `--a-9`. Shell fill `currentColor` @14%, stroke `currentColor` @ 1.8. Strokes scale with the figure on purpose (`vector-effect: non-scaling-stroke` deliberately absent). |
| `.course-art__*` | wash `rgb(255 255 255 / .13)`, shade `rgb(0 0 0 / .12)`, dot `rgb(255 255 255 / .22)`, ring `stroke rgb(255 255 255 / .22) width 1.5` — **every shape is a white or black alpha** so it cannot clash with any of the 18 hues underneath |
| `.course-art__mark` | 44 × 44 px disc, radius 999, `background rgb(0 0 0 / 0.28)`, `box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.30)`, glyph `#fff`. **A BLACK scrim, not white** — white at 18% measured 2.90:1 on the worst hue (190, cyan-teal); the black scrim measures 6.37:1 light / 9.25:1 dark. `backdrop-filter` was removed for cost. |
| `.course-art__subject` | mono, `--fs-mono-label`, `rgb(255 255 255 / 0.88)`, `text-shadow: 0 1px 2px rgb(0 0 0 / 0.25)`. Sits in the **bottom-inline-start** corner, which under the 145° gradient is its **darkest** point — 6.03:1 light / 10.29:1 dark there vs 2.35:1 at the pale end. |

---

## 7. Flutter port — practical notes

### 7.1 Two `ThemeData`s, no `system`

```dart
MaterialApp(
  themeMode: prefs.getString('theme') == 'dark' ? ThemeMode.dark : ThemeMode.light,
  theme: aymanLight, darkTheme: aymanDark,
  locale: const Locale('ar', 'EG'),
  supportedLocales: const [Locale('ar', 'EG')],
  builder: (c, w) => Directionality(textDirection: TextDirection.rtl, child: w!),
)
```

### 7.2 The single sentence that governs colour

> **amber = ACTION · ember = STRUCTURE · green/red = quiz correctness · decorative hues = a
> non-interactive category mark and nothing else.**
> A student learns one thing: **orange is what you press.**

Corollaries you will otherwise get wrong:
* A finished lesson is **not green**.
* An amber label that is not pressable is a bug (the one exception is `.nav-pill[aria-current]`).
* `--a-9` is never text. Amber prose is `--a-11`.
* Text on an amber fill is the fixed literal `#1A1206` in both themes.
* No gradient is ever a **fill on an interactive object**. Gradients exist only on `.stage`,
  `.dash-hero`, `.course-art`, `.app-bloom`/`.hero-bloom`, `.site-btn`'s specular layer and the
  metal badge discs.

### 7.3 Shadows

Write a helper that returns `const []` in dark. Every card/panel/dialog in this product has **zero**
shadow in dark mode and gets its elevation from the surface ladder plus a 4.5%-white top-edge
highlight.

### 7.4 Hairlines

```dart
double hairline(BuildContext c) {
  final dpr = MediaQuery.devicePixelRatioOf(c);
  return dpr >= 2 ? 0.5 : 1.0;
}
```

### 7.5 Touch targets

`--min-tap-size: 44px`. Below 768px the product forces:
topbar action children 44 × 44 · `.chip` 40px tall / 16px inline padding · `.nav-chip` 44 × 44 ·
`Button` `sm` 40px · Dialog/Sheet close 44 × 44 · `.site-btn` 44px min-height.
In Flutter, `MaterialTapTargetSize.padded` gives 48; keep the **visual** box at the sizes above and
let the tap target be larger.

### 7.6 What does not translate and needs a decision

| Web mechanism | Flutter |
|---|---|
| `backdrop-filter: blur(20px)` on the app bar, desktop only | Opaque `--n-1` bar. Do **not** ship a `BackdropFilter` — the CSS comment measures this as the single most expensive declaration in the product on the exact hardware this runs on. |
| `color-mix(in oklch, X P%, Y)` | Port an OKLab mixer; `Color.lerp` diverges noticeably in dark mode (§1.17). |
| `inset` box-shadow (`--panel-lit`, `.chip--done`, `.stage::after`, metal wells) | Draw as an inner `Border`/`CustomPaint`, not `BoxShadow`. |
| `field-sizing: content` on `Textarea` | `TextField(maxLines: null, minLines: …)`. |
| Native `<select>` | Platform picker; do not build a custom listbox. |
| `text-wrap: balance` on `.brand__name` / `.stage__title` / `.media-key__empty` | No Flutter equivalent; hand-wrap or accept the orphan. |
| `overflow-wrap: anywhere` on lesson/attempt titles | `softWrap: true` with no `TextOverflow.ellipsis` — these titles **wrap, never truncate**. |
| `:has()` state hooks (`.runner-option:has(:checked)`, `.stream-field__option:has(input:checked)`) | Ordinary widget state. |
| `steps(1, end)` animations (`robot-blink`, `ask-caret`) | `Curves.linear` on an `IntTween`/`Interval`-stepped controller, or just toggle a bool on a `Timer`. |
| `mix-blend-mode: plus-lighter` (`.site-btn::before`) | `BlendMode.plus` in a `ShaderMask`/`Stack`. |

---

## 8. Verification hooks that already exist

If you change a value on the web side, these fail:

* `packages/ui/src/tokens/tokens.test.ts` — asserts the two dark blocks in `color.css` are identical,
  and asserts the semantic-colour contrast ratios (worst case ≥ 5.6:1).
* `packages/ui/src/lib/branding.test.ts` — asserts `ACCENT_RAMPS.amber` is byte-identical to
  `--a-9…--a-12` in both themes, and that `RADIUS_RAMPS` never exceeds the 8px `lg` ceiling.
* `packages/ui/src/motion/variants.test.ts` — asserts the JS presets match the CSS duration/easing
  tokens.
* `apps/web/lib/welcome-motion.test.ts` — reads `study.css` and fails if any duration mirrored into
  TypeScript drifts.
* `apps/web/e2e/a11y.e2e.ts` — axe run; catches the `--site-accent-solid` contrast regression by name.
* `apps/web/e2e/site-nav-lockup.e2e.ts` — measures the marketing header to the pixel at **705px**;
  this is why `.theme-pill`'s enlargement is scoped rather than applied to the base class.
* `packages/config/eslint/rules/no-physical-direction.js` — bans physical Tailwind utilities.
* `packages/config/eslint/rules/no-layout-animation.js` — bans layout-property animation, `motion.*`,
  and anything over 400 ms.

Design playground routes (not linked from anywhere, exempt from the no-literal-strings rule):
`apps/web/app/dev/tokens` (colour ramp, type ramp, buttons, cards, skeletons),
`apps/web/app/dev/motion` (Motion probe + code block),
`apps/web/app/dev/showpiece` (a bare 640 × 480 render, used to regenerate
`public/showpiece-poster.webp`),
`apps/web/app/dev/taxonomy`.
