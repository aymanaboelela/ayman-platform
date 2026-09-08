# ayman-platform

Two surfaces, one product: a Next.js web app (`apps/web`) and a Flutter app for
Android and iOS (`apps/mobile`). Both talk to the same NestJS API (`apps/api`)
and share the same contracts (`packages/contracts`).

---

## THE PARITY RULE — read this before changing anything a student sees

**A fix on one surface is not finished until the other surface has it.**

If you fix a bug in the mobile app, fix it on the web in the same PR. If you fix
one on the web, fix it in the app. If you add a feature to either, the other one
gets it or the PR says in one line why it cannot.

This is not a style preference. The two apps show the same courses to the same
students; a student who does their homework on a phone and checks their marks on
a laptop must not meet two different products. The moment they diverge, every
subsequent change has to be made twice by someone who does not know that.

### What is already shared, and must stay shared

| Thing | Source of truth | How it reaches the app |
|---|---|---|
| Every Arabic string | `packages/contracts/src/copy/` | `pnpm mobile:copy` → `assets/translations/*.json` + `CopyKeys` |
| Form validation messages | the zod schemas in `packages/contracts` | `pnpm mobile:validation` → `ValidationMessages` |
| Colours, type, spacing, radii, motion | `packages/ui/src/tokens/*.css` | hand-transcribed into `lib/core/theme/`, values commented with their token name |
| Request/response shapes | `packages/contracts` | hand-written Dart models that cite the schema |
| Phone normalisation | `packages/contracts/src/phone.ts` | `lib/core/functions/egyptian_phone.dart`, pinned by a test with the same fixtures |

**Never hand-write an Arabic string in Dart.** Run `pnpm mobile:sync` and use the
generated `CopyKeys` constant. A string typed into a widget is a string that
will disagree with the web within a month.

**When you change a design token,** change `lib/core/theme/app_palette.dart` in
the same commit. Its values are the sRGB conversions of the OKLCH declarations
in `color.css`; the conversion is arithmetic, not taste — recompute, do not
eyeball.

### What is deliberately NOT shared

- **Navigation shape.** The web has a 296px side rail; the app has a drawer.
  Same destinations, different chrome.
- **The marketing site** (`apps/web/app/(site)`). A student who installed the
  app has already been acquired. Those routes open in a browser — see
  `AppRoutes.notInTheApp`, which lists every one and why.
- **The auth showcase panel.** It exists to fill a 1440px column.

---

## Working on `apps/mobile`

```sh
pnpm mobile:sync      # regenerate copy + validation messages from contracts
pnpm mobile:icons     # regenerate launcher icons from the portrait
cd apps/mobile
flutter analyze lib   # must be clean, no exceptions
flutter test
flutter run --dart-define=APP_ENV=dev    # points at the local API on :3300
flutter run                              # points at production
```

### Rules the code follows and you must too

1. **One widget per file.** No exceptions.
2. **Never write `Widget _buildSomething()`.** Extract a widget class. This was
   asked for by name and it is what keeps a screen refactorable.
3. Colours from `AppColors.of(context)`, type from `AppTextStyle.of(context)`.
   A literal `Color(0x…)` or `fontSize:` in a widget is a bug.
4. Directional insets only — `EdgeInsetsDirectional`, `start`/`end`. The app is
   RTL and `left`/`right` silently mirrors wrong.
5. Every tappable thing clears 44 logical pixels.
6. Radii never exceed `AppRadius.lg` (8px). That ceiling is the design.
7. Comment the WHY. A comment that restates the code is worse than none.

### Things that will bite you

- **`easy_localization` re-exports `intl`**, whose `TextDirection` is a class
  with `LTR`/`RTL` — a different type from `dart:ui`'s enum. Import it with
  `hide TextDirection` wherever you touch direction.
- **`SliverFillRemaining(hasScrollBody: false)` + `Spacer`** measures intrinsic
  height, and any `LayoutBuilder` in the subtree (every text field has one)
  makes that throw. The page renders blank and the real message is buried under
  150 frames of paint stack. Use `ConstrainedBox(minHeight:)` + `spaceBetween`.
- **`flutter_secure_storage` is pinned below 11** and **`permission_handler`
  below 13** — both newer majors need AGP 9. The reasons are in `pubspec.yaml`
  next to each pin; read them before bumping.
- **Android XML forbids `--` inside a comment.** Writing a CSS token name with
  its two leading dashes in `colors.xml` fails the whole resource merge.

---

## The API changes the app needed

Three, all in `apps/api`, all of which the web benefits from too:

1. **`bearer()` in `auth.config.ts`.** A native client has no cookie jar, and a
   cookie it *does* send switches on better-auth's origin check, which then 403s
   because a native request has no `Origin`. Without this plugin every mobile
   request is ANONYMOUS — not 401 — so public routes keep working and only the
   signed-in ones break.
2. **`trackerFromRequest` hashes the `Authorization` header** when there is no
   session cookie. Otherwise every signed-in mobile student falls into the IP
   bucket, and Egyptian mobile data is carrier-NATed hard enough that one
   operator's students would throttle each other out of their own lessons.
3. **`AllExceptionsFilter` surfaces `code`.** About thirty services throw
   `{ code: 'quiz_not_open_yet' }` and the filter was discarding it, answering
   `"Forbidden Exception"`. Every distinct refusal reached every client as the
   same unexplainable wall.

---

## Still to wire up (needs a human with the right console open)

- **Google sign-in** has no OAuth client at all — see
  `docs/runbooks/google-sign-in.md`. The app's button hides itself until
  `GOOGLE_SERVER_CLIENT_ID` is compiled in, so nothing is broken meanwhile.
- **Sign in with Apple** needs a paid Apple Developer membership before the
  entitlements in `ios/Runner/Runner.entitlements` can be provisioned.
- **Push** needs the FCM service-account key on the server. The Firebase project
  (`aymanaboelela-b89c0`) and both apps already exist.
