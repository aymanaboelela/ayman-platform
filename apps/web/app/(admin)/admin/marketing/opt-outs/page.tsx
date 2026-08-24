import { z } from 'zod';
import { OptOutRowSchema } from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import {
  Card,
  CardBody,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { MarketingTabs } from '../tabs';
import { AddOptOutForm } from './opt-out-form';
import { RemoveOptOutButton } from './remove-opt-out-button';

const c = copy.marketing;

export const metadata = { title: c.optOutsTitle };

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' });

/**
 * «طلبوا الإيقاف» — every number no campaign may ever message again.
 *
 * Most rows here arrive on their own, written by
 * `WhatsappInboundController` the moment somebody replies «قف». This screen
 * exists for the numbers that don't: someone who asked by any other channel.
 */
export default async function MarketingOptOutsPage() {
  const rows = await adminGet('/api/admin/marketing/opt-outs', z.array(OptOutRowSchema));

  return (
    <>
      <MarketingTabs />

      <div className="mb-6">
        <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.optOutsTitle}</h1>
        <p className="max-w-[var(--w-prose)] text-fg-muted">{c.optOutsLead}</p>
      </div>

      <div className="mb-4">
        <AddOptOutForm />
      </div>

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-fg-muted">{c.optOutsEmpty}</p>
          ) : (
            <TableWrapper className="rounded-none border-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{c.colPhone}</TableHead>
                    <TableHead>{c.colReason}</TableHead>
                    <TableHead>{c.colDate}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.phone}>
                      <TableCell className="mono" dir="ltr">
                        {row.phone}
                      </TableCell>
                      <TableCell className="text-fg-muted">{row.reason ?? '—'}</TableCell>
                      <TableCell className="mono">{dateFormatter.format(new Date(row.createdAt))}</TableCell>
                      <TableCell>
                        <RemoveOptOutButton phone={row.phone} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </CardBody>
      </Card>
    </>
  );
}
