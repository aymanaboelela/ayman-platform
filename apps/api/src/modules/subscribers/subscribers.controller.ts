import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ListQuerySchema, type ListResponse } from '@ayman/contracts/admin/list';
import {
  SUBSCRIBERS_EXPORT_MAX,
  SubscribersQuerySchema,
  metaPhone,
  splitName,
  type SubscriberRow,
  type SubscribersOverview,
} from '@ayman/contracts/admin/subscribers';
import { parseRequest } from '../../common/http/parse-request';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { toCsv } from '../analytics/csv';
import { toXlsx, XLSX_CONTENT_TYPE, type XlsxColumn } from '../analytics/xlsx';
import { SubscribersService, type SubscriberExportRow } from './subscribers.service';

/** Every filter the screen puts in its URL — the list, the workbook and the ads file all read these. */
interface FilterParams {
  status?: string;
  audience?: string;
  courseId?: string;
  monthId?: string;
  year?: string;
  withPhone?: string;
  q?: string;
}

/**
 * `/api/admin/subscribers` — «مين مشترك ومين لأ».
 *
 * `student:read`, like `/admin/follow-up`: every row is a student's name and
 * phone, and every one links to a record that permission already opens. The
 * ads file is the same rows in a different shape, so it needs nothing more.
 *
 * `@RequireFeature` on the whole controller — «Ayman first», off on another
 * stack until the owner opens it (`new-features-ayman-first-openable`).
 */
@Controller('admin/subscribers')
@RequireFeature('subscribersReport')
@RequirePermission('student:read')
export class AdminSubscribersController {
  constructor(private readonly subscribers: SubscribersService) {}

  @Get('overview')
  overview(): Promise<SubscribersOverview> {
    return this.subscribers.overview();
  }

  @Get()
  async list(
    @Query() params: FilterParams & { page?: string; perPage?: string },
  ): Promise<ListResponse<SubscriberRow>> {
    const filter = parseFilter(params);
    const list = parseRequest(ListQuerySchema, { page: params.page, perPage: params.perPage }, 'list query');
    return this.subscribers.list(filter, list.perPage, (list.page - 1) * list.perPage);
  }

  /**
   * The ads file — Meta's customer-list columns (`phone`, `fn`, `ln`,
   * `country`), so the upload maps itself with no column picking.
   *
   * NO BOM, unlike `toCsv`: this file is read by Meta's importer, not by
   * Excel, and a BOM glued to the first header is how `phone` stops being
   * recognised as `phone`. Rows without a usable number are dropped — Meta
   * cannot match them and counts them against the upload. `parents=1` adds
   * a row per parent's number: the parent is the one who pays.
   */
  @Get('export/meta.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="meta-audience.csv"')
  @Header('cache-control', 'private, no-store')
  async exportMeta(@Query() params: FilterParams & { parents?: string }): Promise<string> {
    const rows = await this.subscribers.exportRows(parseFilter(params), SUBSCRIBERS_EXPORT_MAX);
    const seen = new Set<string>();
    const lines: unknown[][] = [];
    const push = (phone: string | null, first: string, last: string) => {
      const normalised = metaPhone(phone);
      if (normalised === null || seen.has(normalised)) return;
      seen.add(normalised);
      lines.push([normalised, first, last, 'EG']);
    };
    for (const row of rows) {
      const { first, last } = splitName(row.name);
      push(row.phone, first, last);
      if (params.parents === '1') {
        // The parent's own name is not on file; the family name usually is.
        push(row.fatherPhone, '', last);
        push(row.motherPhone, '', '');
      }
    }
    return toCsv(['phone', 'fn', 'ln', 'country'], lines).replace(/^\uFEFF/, '');
  }

  /** The same selection as a workbook to read — names, numbers, what each one holds. */
  @Get('export/students.xlsx')
  async exportXlsx(@Query() params: FilterParams, @Res() res: Response): Promise<void> {
    const rows = await this.subscribers.exportRows(parseFilter(params), SUBSCRIBERS_EXPORT_MAX);
    const buffer = await toXlsx('المشتركين', COLUMNS, rows);
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': 'attachment; filename="subscribers.xlsx"',
      // `@Res()` bypasses the interceptor that gives admin reads no-store.
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  }
}

function parseFilter(params: FilterParams) {
  // `parseRequest`, never a bare `.parse()`: a ZodError is not an
  // HttpException and would surface as a 500 blaming the server.
  return parseRequest(
    SubscribersQuerySchema,
    {
      status: params.status,
      audience: params.audience,
      courseId: params.courseId || undefined,
      monthId: params.monthId || undefined,
      year: params.year || undefined,
      withPhone: params.withPhone || undefined,
      q: params.q ?? '',
    },
    'filter',
  );
}

const YEAR_LABEL: Record<number, string> = { 1: 'أولى ثانوي', 2: 'تانية ثانوي', 3: 'تالتة ثانوي' };

function holdingsText(row: SubscriberRow): string {
  return row.holdings
    .map((h) => (h.wide ? `${h.title} (كامل)` : `${h.title} (شهر ${h.monthIndexes.join('، ')})`))
    .join(' · ');
}

const COLUMNS: readonly XlsxColumn<SubscriberExportRow>[] = [
  { header: 'الاسم', kind: 'text', width: 28, value: (r) => r.name },
  { header: 'الموبايل', kind: 'text', width: 16, value: (r) => r.phone },
  { header: 'موبايل الأب', kind: 'text', width: 16, value: (r) => r.fatherPhone },
  { header: 'موبايل الأم', kind: 'text', width: 16, value: (r) => r.motherPhone },
  { header: 'السنة', kind: 'text', width: 14, value: (r) => (r.year === null ? null : (YEAR_LABEL[r.year] ?? String(r.year))) },
  { header: 'مشترك في', kind: 'text', width: 40, value: holdingsText },
  { header: 'اشترك قبل كده', kind: 'text', width: 12, value: (r) => (r.everSubscribed ? 'أيوه' : 'لأ') },
  { header: 'عمل الحساب', kind: 'datetime', value: (r) => r.createdAt },
];
