import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { ResumeBookOrder } from '@/components/books/resume-book-order';
import { getBookCatalogOrEmpty } from '@/lib/books';
import { getMyBookOrdersOrEmpty } from '@/lib/my-book-orders';
import { getPublicSettingsOrDefaults } from '@/lib/settings';

export const metadata: Metadata = { title: copy.books.mine.resumeTitle };

const c = copy.books.mine;

/**
 * «كمّل الدفع» — طلب كتاب اتسجّل والدفع لسه.
 *
 * ## الباب كان ناقص، مش مقفول
 *
 * `POST /api/book-orders/:id/payment` موجود من الأول وبيحرّك الطلب من
 * `address_only` لـ`paid`. واللي كان بيوصله حاجة واحدة: `localStorage` على
 * المتصفح اللي الطلب اتعمل منه — لزائر قفل التاب، وده صح لحالته.
 *
 * بس الطالب المسجّل بيشوف طلبه في «كتبي» بسطر بيقول «لسه ماتدفعش. كمّل الدفع»
 * وتحته **مفيش زرار**. الجملة بتطلب حاجة والشاشة مافيهاش طريقة تعملها — ولو
 * مسح الكاش أو بدّل الجهاز، اللوكال ستوريج اللي كان هيوصّله راح كمان.
 *
 * الصفحة دي هي الطريق: معرّف الطلب في الـURL، والسيرفر بيتأكد إنه بتاعه.
 *
 * ## ليه صفحة مش ديالوج
 *
 * البانل عايز أسعار الشحن والمحفظة والإنستاباي — دي قرايات سيرفر. ديالوج جوّه
 * كارت الطلب كان معناه إما تمرير التلاتة من كل مكان بيرسم الكارت (الداشبورد
 * و«كل طلباتي»)، أو قراية تانية من المتصفح بعد ما يفتح. الصفحة بتقراهم مرة
 * واحدة على السيرفر — ولينك ينفع يتبعت في واتساب كمان.
 *
 * ## التحقق
 *
 * `getMyBookOrdersOrEmpty` بيرجّع طلبات **الطالب ده** بس، فالبحث جوّاها هو
 * التحقق نفسه — معرّف طلب حد تاني مالوش وجود في الليستة و`notFound()` بترد.
 * و`notFound()` مش ٤٠٣ لنفس السبب المكتوب في `(admin)/layout.tsx`: الصفحة مش
 * «ممنوعة»، هي مش هنا.
 *
 * وطلب اتدفع خلاص بيروح لنفس المكان: مفيش دفع يتكمّل، والبانل نفسه بيرسم
 * `alreadyOrdered` لو حصل — بس صفحة اسمها «كمّل الدفع» على طلب مدفوع تبقى
 * كدبة قبل ما البانل يفتح أصلًا.
 */
export default async function ResumeBookOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  const [orders, catalog, { contact }] = await Promise.all([
    getMyBookOrdersOrEmpty(),
    getBookCatalogOrEmpty(),
    getPublicSettingsOrDefaults(),
  ]);

  const order = orders.find((row) => row.id === orderId);
  if (!order || order.status !== 'address_only') notFound();

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <header className="study-head">
        <p className="eyebrow mb-2 text-fg-muted">{c.resumeBadge}</p>
        <h1 className="study-head__title">{c.resumeTitle}</h1>
        <p className="study-head__lead">{c.resumeLead}</p>
      </header>

      <div className="store-surface mt-6">
        <ResumeBookOrder
          orderId={order.id}
          itemsCents={order.itemsCents}
          shippingRates={catalog.shippingRates}
          instapay={contact.instapay}
          vodafoneCash={contact.vodafoneCash}
        />
      </div>
    </main>
  );
}
