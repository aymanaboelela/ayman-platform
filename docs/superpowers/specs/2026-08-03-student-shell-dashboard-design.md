# Student shell + dashboard — design

**Date:** 2026-08-03
**Status:** approved, slice 1 of 4
**Scope:** the signed-in student's navigation shell and `/dashboard`. Nothing else.

## Why

The signed-in surface has one horizontal header and a dashboard whose every element
carries the same weight: four identical tiles, two dashed empty boxes, one flat
`surface-2` everywhere. A student who has just finished onboarding lands on a page
that shows four zeros and no instruction on what to do next. Nothing is wrong with
the *tokens* — the dashboard already uses them correctly — the problem is that the
page has no hierarchy and no first-run path.

This slice fixes the shell and the dashboard. Three further slices follow and are
out of scope here:

| Slice | Contents |
|---|---|
| 2 | Quiz analytics for the student: charts, attempt review entry points, retake |
| 3 | Student profile page, avatar upload, watch-history timeline (needs a new table) |
| 4 | Notifications (new model, endpoints, bell, read state) |

Slice 1 deliberately requires **no API and no schema change**. Everything it renders
is already in the `/api/me/dashboard` and `/api/session` payloads.

## Decisions taken

1. **A persistent rail that collapses itself.** The rail sits at the inline start
   (the right edge in RTL) on every signed-in route. On `/courses/*/lessons/*` it
   collapses to an 80px icon rail so it never competes with the player's own
   outline sidebar; on a running attempt (`/quizzes/*/attempt/*`) the whole shell
   disappears, exactly as `AppHeader` already does today.
2. **A first-run "ابدأ من هنا" card inside the dashboard**, not an overlay tour.
   Its three steps tick themselves off the data that already exists, and the card
   stops rendering once all three are done. No new column, no dismissal flag, and
   nothing that can get stuck in a wrong state.

## Architecture

### The layout must stay synchronous

`(app)/layout.tsx` carries a load-bearing comment: it is deliberately not `async`.
It used to `await getSession()` to decide whether to draw the admin link, and that
made every client-side transition into the group wait on a `/api/session`
round-trip with the previous page still mounted. `AdminLink` fixed it by moving the
session read into its own `<Suspense>` boundary.

The rail needs the student's course list and the account menu needs their name and
avatar. Both are async reads, so both follow the same precedent rather than
reverting it: the layout stays synchronous and passes **pre-rendered, Suspense-
wrapped Server Component nodes** down as props.

```
(app)/layout.tsx            sync — ships no await
└── <StudentShell>          client — owns collapse state + pathname
    ├── railCourses  = <Suspense><RailCourses/></Suspense>      async RSC
    └── accountMenu  = <Suspense><AccountMenu/></Suspense>       async RSC
```

`RailCourses` and `DashboardPage` both need `/api/me/dashboard`. A second fetch of
the same endpoint on one render is a second round-trip, so the call is wrapped in
React's `cache()` in `lib/dashboard.ts` — per-request, so nothing leaks between
users, and the underlying `fetch` stays `no-store`.

### Chrome state

| State | Where it lives | Why |
|---|---|---|
| Collapsed by preference | Cookie, read by the server on first paint, written by the client on toggle | A cookie is the only store the server can read, so the rail never paints expanded and then snaps shut |
| Collapsed by route | `usePathname()` in `StudentShell` | Layouts persist across navigation; only a client read reacts to the route changing |
| Shell hidden entirely | `usePathname()`, same component | Identical rule to today's `isAttemptRoute` |

Route-forced collapse **overrides** the preference and does not overwrite it —
leaving a lesson restores whatever the student had chosen.

### Components

New, under `components/app/`:

- `student-nav-items.ts` — the one nav table plus `activeStudentNav(pathname)`.
  Mirrors `components/admin/nav-items.ts`, including the longest-href-wins rule, so
  the rail, the mobile sheet and the topbar title cannot disagree about what is
  current. Icons are lucide components, never emoji.
- `student-shell.tsx` — client. Grid, collapse state, route rules.
- `student-rail.tsx` — the rail's own markup and nav list.
- `rail-courses.tsx` — async RSC; the student's courses with a progress meter each.
- `student-topbar.tsx` — client. Mobile menu trigger, current-page title, theme
  toggle, account menu slot. No notification bell in this slice: dead chrome that
  does nothing is worse than chrome that is not there yet.
- `account-menu.tsx` — async RSC reading `getSession()`, rendering a client
  dropdown: name, email, avatar (`session.image`, already nullable in
  `SessionSchema`), links to devices and the admin panel when permitted, sign-out.

`AppHeader` is removed. Its three jobs — nav, theme, sign-out — all move into the
rail and topbar, and leaving it mounted would draw two navigations.

### The dashboard

The page is rebuilt around one rule: **exactly one element on the screen is the
primary action.** Today four stat tiles, a continue-watching card and two dashed
empty boxes all compete at equal weight.

```
┌─ hero ────────────────────────────────────────────────┐
│  Continue watching  —  OR  —  Start here (first run)  │   accent-tinted, one CTA
└───────────────────────────────────────────────────────┘
┌─ stats ─────────┬─────────┬─────────┬─────────────────┐
│  courses        │ lessons │ overall │ average score   │   quiet; meter, not chip
└─────────────────┴─────────┴─────────┴─────────────────┘
┌─ my courses (2fr) ──────────┬─ recent scores (1fr) ────┐
│  course cards with progress │  last five, as a strip   │
│                             │  quick links             │
└─────────────────────────────┴──────────────────────────┘
```

Specific fixes to the visual problems in the current build:

- **Hierarchy.** The hero is the only accent-tinted surface and the only filled
  button on the page. Stat tiles lose their accent-tinted icon chips — which read
  as four unexplained orange squares — and become muted icon + large tabular
  number + a hairline meter. Accent survives only in the meter fill.
- **Warmth.** One soft radial accent glow behind the hero at very low alpha. It is
  a single decorative layer, not a new colour: the token stays `--a-9`.
- **Empty states.** Two dashed boxes become one designed object. When there is
  nothing to continue, the hero *is* the start-here card.
- **Scores get a shape.** `recentScores` already returns up to five results, so the
  scores card gains a five-bar strip above the list — the same hand-rolled bars
  `admin/quiz/score-histogram.tsx` uses. No chart library: five bars do not justify
  a dependency, and the real charts are slice 2.

### First-run steps

Derived entirely from the dashboard payload, in a pure function so it is testable
without a render:

| Step | Done when |
|---|---|
| اشترك في كورس | `enrolledCourses.length > 0` |
| افتح أول درس | any enrolled course has `lastLessonId !== null` |
| حل أول كويز | `recentScores.length > 0` |

The card renders only while at least one step is outstanding, and the first
outstanding step carries the CTA. Once all three pass, the hero reverts to
continue-watching and the card is gone for good — without ever having been
persisted.

## Error handling

Unchanged from the current behaviour and deliberately so. `apiGetAuthed` throws
`ApiRequestError` on a non-2xx; the route's `error.tsx`/`loading.tsx` pair already
covers the dashboard. The two new Suspense boundaries (`RailCourses`,
`AccountMenu`) degrade independently: if the courses read fails the rail still
renders its primary nav, and if the session read fails the topbar still renders
its title and theme toggle. Neither can take the page down, which is the whole
reason they are separate boundaries rather than an `await` in the layout.

## Testing

- `activeStudentNav` — longest-href-wins, including `/dashboard` vs
  `/dashboard/anything`, mirroring the admin test.
- `startHereSteps` — each of the eight combinations of the three booleans, plus
  "renders nothing when complete".
- `summarise` — already covered; extended for the average-score null case.
- Shell route rules — attempt route hides the shell, lesson route forces collapse,
  preference restored on leaving.
- Playwright: the existing signed-in nav spec is updated to drive the rail instead
  of the removed header, and an axe pass runs on the rebuilt dashboard.

## Out of scope

Notifications, the profile page, avatar upload, the watch-history timeline, quiz
charts, and retake entry points. Each is named against its slice in the table at
the top of this document.
