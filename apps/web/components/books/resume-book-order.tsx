'use client';

import { useRouter } from 'next/navigation';
import type { BookShippingRates } from '@ayman/contracts/books';
import { MY_BOOK_ORDERS_HREF } from '@/lib/book-order-view';
import { BookOrderPanel } from '@/components/site/book-order-panel';

/**
 * غلاف عميل رفيع حوالين `<BookOrderPanel>` لطلب موجود.
 *
 * البانل عميل ومحتاج `onCancel` — والصفحة اللي فوقه سيرفر، فمقدرش تديله دالة.
 * ده كل اللي هنا: «رجوع» بترجّع لـ«كل طلباتي»، وهو المكان اللي الطالب جه منه.
 *
 * مفيش `courseId` ولا `items`: دول بيتبعتوا وقت **إنشاء** طلب، والطلب ده موجود
 * خلاص. `resumeOrderId` بيخلّي البانل يجيبه بنفسه ويملا العنوان اللي متسجّل
 * ويقف على خطوة الدفع.
 */
export function ResumeBookOrder({
  orderId,
  itemsCents,
  shippingRates,
  instapay,
  vodafoneCash,
}: {
  orderId: string;
  itemsCents: number;
  shippingRates: BookShippingRates;
  instapay: string | null;
  vodafoneCash: string | null;
}) {
  const router = useRouter();

  return (
    <BookOrderPanel
      resumeOrderId={orderId}
      itemsCents={itemsCents}
      shippingRates={shippingRates}
      instapay={instapay}
      vodafoneCash={vodafoneCash}
      onCancel={() => router.push(MY_BOOK_ORDERS_HREF)}
    />
  );
}
