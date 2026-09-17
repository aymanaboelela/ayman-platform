/**
 * ⚠️ A PLAIN module, deliberately — not an export of `book-order-button.tsx`.
 *
 * That file is `'use client'`, and this helper is called from three SERVER
 * components: the public course page, the dashboard's `EnrolledCourseCard` and
 * the player's outline sidebar. A plain function exported from a client module
 * is not callable on the server — React answers «Attempted to call
 * courseBookCtaVisible() from the server but courseBookCtaVisible is on the
 * client», the render throws, and the page 500s.
 *
 * Nothing catches that before the app actually runs: it typechecks, it unit
 * tests, and it fails only when a request reaches the route. It was found by
 * Playwright on CI, which is the cheapest place it could still have been found.
 * Keep server-callable logic out of `'use client'` files.
 *
 * ## What it decides
 *
 * Whether «اطلب الكتاب» belongs on a course surface at all.
 *
 * Three surfaces ask this question — the public course page, the dashboard's
 * `EnrolledCourseCard` and the player's `CourseOutlineSidebar` — and they used
 * to answer it with three copies of `bookTitle !== null && bookPriceCents !==
 * null`. One helper, because the rule behind those two fields has changed under
 * them and three copies is how one screen keeps the old one.
 *
 * ## Why placement is NOT checked here
 *
 * `books.show_on_course` is the admin's «الكتاب ده يتباع من قسم الكتب بس», and
 * it is tempting to read it on this side. It is enforced on the API side
 * instead — `courseBook()` in `catalog.service.ts` returns
 * `bookTitle: null, bookPriceCents: null` for a live book whose flag is off, so
 * a course that must not advertise its book arrives here with nothing to
 * advertise.
 *
 * That is not merely tidier, it is the only correct place for it. These three
 * surfaces read THREE different payloads (`CatalogCourseDetail`, the dashboard's
 * enrolled-course row, the player's outline), and a flag added to the public
 * contract would have to be threaded through all three and every serializer
 * between — with a missing one showing up as a button that quietly keeps
 * appearing on the screen nobody checked. Deriving the title and the price from
 * the same decision means there is no second field to forget: no title, no
 * button, everywhere, already.
 */
export function courseBookCtaVisible(course: {
  bookTitle: string | null;
  bookPriceCents: number | null;
}): boolean {
  return course.bookTitle !== null && course.bookPriceCents !== null;
}
