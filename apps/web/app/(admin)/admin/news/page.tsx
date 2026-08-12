import Link from 'next/link';
import { z } from 'zod';
import { AdminNewsRowSchema } from '@ayman/contracts/news';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge, Card, CardBody } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';

export const metadata = { title: copy.adminNews.title };

/**
 * The «نيوز» admin list.
 *
 * Uncached, like every other admin read here: an editor must see their own
 * last write, never a stale row that makes a save look like it failed.
 */
export default async function AdminNewsPage() {
  const rows = await adminGet('/api/admin/news', z.array(AdminNewsRowSchema));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
            {copy.adminNews.title}
          </h1>
          <p className="max-w-[var(--w-prose)] text-fg-muted">{copy.adminNews.lead}</p>
        </div>
        <Link
          href="/admin/news/new"
          className="rounded-sm bg-accent px-4 py-2 font-medium text-[#1A1206]"
        >
          {copy.adminNews.create}
        </Link>
      </div>

      <Card>
        <CardBody className="divide-y divide-line-subtle p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-fg-muted">{copy.adminNews.empty}</p>
          ) : (
            rows.map((row) => (
              <Link
                key={row.id}
                href={`/admin/news/${row.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-[160ms] ease-out hover:bg-surface-2"
              >
                <span className="flex-1 min-w-[12rem] font-medium text-fg">{row.title}</span>

                {/*
                  The status is a BADGE and not a colour on the row: colour
                  alone is not an accessible signal (WCAG 1.4.1), and «مسودة»
                  vs «منشورة» is the single most consequential fact in this
                  list — it is the difference between a page the world can read
                  and one it cannot.
                */}
                <Badge tone={row.status === 'published' ? 'ok' : 'neutral'}>
                  {row.status === 'published'
                    ? copy.adminNews.statusPublished
                    : copy.adminNews.statusDraft}
                </Badge>

                <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                  {new Date(row.updatedAt).toLocaleDateString('ar-EG')}
                </span>
              </Link>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}
