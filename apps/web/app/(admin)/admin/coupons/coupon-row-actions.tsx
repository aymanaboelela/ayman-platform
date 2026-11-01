'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ListChecks, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import type { AdminCouponRedemptions, AdminCouponRow } from '@ayman/contracts/admin/coupons';
import type { AdminUnlockCourseOption } from '@ayman/contracts/admin/unlock-codes';
import { adminCouponsCopy as c } from '@ayman/contracts/copy/admin-coupons';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { formatEGP } from '@/lib/price';
import { couponRedemptionsAction, deleteCouponAction, updateCouponAction } from './actions';
import { CouponForm } from './coupon-form';

const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});

/**
 * One row's buttons: «إيقاف»/«تشغيل», «تعديل» (the creation form again,
 * every field — see `AdminCouponUpdateSchema`), «الاستخدامات», and «حذف» for a
 * code nobody used. `canWrite` is `payment:review`; without it only the history opens.
 */
export function CouponRowActions({
  coupon,
  courses,
  canWrite,
}: {
  coupon: AdminCouponRow;
  courses: AdminUnlockCourseOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<AdminCouponRedemptions | null | 'loading'>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        after?.();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function openHistory() {
    setHistoryOpen(true);
    setHistory('loading');
    void couponRedemptionsAction(coupon.id).then(setHistory);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 md:justify-end">
      <Button variant="secondary" size="sm" onClick={openHistory}>
        <ListChecks className="size-4" aria-hidden="true" />
        {c.redemptions}
      </Button>
      {canWrite ? (
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => run(() => updateCouponAction(coupon.id, { isActive: !coupon.isActive }), c.saved)}
          >
            {coupon.isActive ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {coupon.isActive ? c.pause : c.resume}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden="true" />
            {c.edit}
          </Button>
          {coupon.usesCount === 0 ? (
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (window.confirm(c.removeConfirm)) run(() => deleteCouponAction(coupon.id), c.removed);
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {c.remove}
            </Button>
          ) : null}
        </>
      ) : null}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent closeLabel={c.cancel}>
          <DialogHeader>
            <DialogTitle>
              {c.editTitle}{' '}
              <bdi dir="ltr" className="mono">
                {coupon.code}
              </bdi>
            </DialogTitle>
            <DialogDescription>{c.editHint}</DialogDescription>
          </DialogHeader>
          <CouponForm courses={courses} coupon={coupon} onSaved={() => setEditing(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent closeLabel={c.cancel}>
          <DialogHeader>
            <DialogTitle>{formatCopy(c.redemptionsTitle, { code: coupon.code })}</DialogTitle>
          </DialogHeader>
          {history === 'loading' ? (
            <p className="text-fg-muted">{c.loading}</p>
          ) : history === null ? (
            <p className="text-[color:var(--err)]">{c.errors.failed}</p>
          ) : history.items.length === 0 ? (
            <p className="text-fg-muted">{c.redemptionsEmpty}</p>
          ) : (
            <ul className="grid max-h-[60vh] gap-2 overflow-y-auto">
              {history.items.map((item) => (
                <li key={item.id} className="grid gap-1 rounded-md border border-line-subtle bg-surface-1 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/admin/students/${encodeURIComponent(item.student.id)}`} className="font-semibold text-fg hover:underline">
                      {item.student.name}
                    </Link>
                    <span className="font-bold text-[color:var(--ok)]" dir="ltr">
                      −{formatEGP(item.discountCents)}
                    </span>
                  </div>
                  <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
                    {item.course.title} · {c.redemptionStatus[item.submissionStatus]}
                    {item.paidFromWallet ? ` · ${c.redemptionWallet}` : ''}
                  </p>
                  <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
                    {DATE.format(new Date(item.createdAt))}
                    {item.releasedAt ? ` · ${c.redemptionReleased}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
