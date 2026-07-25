import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Skeleton } from '@ayman/ui';
import { ThemeToggle } from '@/components/theme-toggle';

const NEUTRALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const TYPE_ROWS = [
  ['display-1', 'var(--fs-display-1)', 'var(--lh-display-1)', 600],
  ['display-2', 'var(--fs-display-2)', 'var(--lh-display-2)', 600],
  ['title-1', 'var(--fs-title-1)', 'var(--lh-title-1)', 600],
  ['title-2', 'var(--fs-title-2)', 'var(--lh-title-2)', 600],
  ['title-3', 'var(--fs-title-3)', 'var(--lh-title-3)', 500],
  ['text-base', 'var(--fs-text-base)', 'var(--lh-text-base)', 400],
  ['text-sm', 'var(--fs-text-sm)', 'var(--lh-text-sm)', 400],
] as const;

export default function TokenGalleryPage() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <header className="mb-12 flex items-center justify-between">
        <div>
          <p className="eyebrow mb-2">00 / نظام التصميم</p>
          <h1 className="text-[length:var(--fs-title-1)] font-semibold">معرض الـ tokens</h1>
        </div>
        <ThemeToggle />
      </header>

      <section className="mb-12">
        <p className="eyebrow mb-4">01 / الألوان</p>
        <div className="grid grid-cols-12 overflow-hidden rounded-lg border border-line">
          {NEUTRALS.map((step) => (
            <div
              key={step}
              className="flex h-16 items-end justify-center pb-1 text-[10px]"
              style={{ background: `var(--n-${step})`, color: step > 8 ? 'var(--n-1)' : 'var(--n-12)' }}
            >
              {step}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Badge tone="accent">accent</Badge>
          <Badge tone="ok">إجابة صحيحة</Badge>
          <Badge tone="err">إجابة خاطئة</Badge>
          <Badge tone="warn">الوقت شارف على الانتهاء</Badge>
          <Badge>محايد</Badge>
        </div>
      </section>

      <section className="mb-12">
        <p className="eyebrow mb-4">02 / الخطوط</p>
        <Card>
          <CardBody className="space-y-4">
            {TYPE_ROWS.map(([name, size, lh, weight]) => (
              <div key={name} className="flex items-baseline gap-6">
                <code className="shrink-0 text-[length:var(--fs-mono-label)]">{name}</code>
                <span style={{ fontSize: size, lineHeight: lh, fontWeight: weight }}>
                  البرمجة وعلوم الحاسب — الصف الثاني الثانوي
                </span>
              </div>
            ))}
            <div className="border-t border-line-subtle pt-4">
              <span className="text-[length:var(--fs-text-base)]">
                خط عربي ولاتيني في سطر واحد: استخدم <code>const</code> بدلاً من <code>var</code> — 0123456789
              </span>
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="mb-12">
        <p className="eyebrow mb-4">03 / الأزرار</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">ابدأ الكورس</Button>
          <Button variant="secondary">التفاصيل</Button>
          <Button variant="ghost">إلغاء</Button>
          <Button variant="danger">حذف</Button>
          <Button variant="primary" size="sm">صغير</Button>
          <Button variant="primary" disabled>معطّل</Button>
        </div>
      </section>

      <section className="mb-12">
        <p className="eyebrow mb-4">04 / الكروت والتحميل</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>مقدمة في البرمجة</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-fg-muted">
              <p>الوحدة الأولى — المتغيرات والأنواع.</p>
              <p className="mono text-[length:var(--fs-mono-label)]">12 درس · 3 س 40 د</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>حالة التحميل</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <Skeleton width="full" />
              <Skeleton width="wide" />
              <Skeleton width="narrow" />
            </CardBody>
          </Card>
        </div>
      </section>
    </main>
  );
}
