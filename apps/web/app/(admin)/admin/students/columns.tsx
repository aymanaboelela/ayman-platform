'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import type { AdminStudentRow } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';
import { Checkbox } from '@ayman/ui/components/checkbox';

/**
 * `id` on the three sortable columns matches `STUDENT_SORT_COLUMNS`'s keys
 * exactly (A3) — `use-data-table.ts`'s `sortFromSearchParams` resolves
 * through that same map, so a column here that drifts from the map either
 * cannot be sorted or silently sorts the wrong column.
 */
export const studentColumns: ColumnDef<AdminStudentRow, unknown>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        aria-label={copy.admin.list.selectAll}
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={copy.admin.list.selectRow}
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
      />
    ),
    enableSorting: false,
  },
  {
    id: 'fullName',
    accessorKey: 'fullName',
    header: copy.admin.students.columnName,
    enableSorting: true,
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2">
        <Link
          href={`/admin/students/${row.original.id}`}
          className="font-[var(--fw-medium)] text-fg hover:underline"
        >
          {row.original.fullName}
        </Link>
        {/*
          On the NAME cell rather than as a column of its own. A «موقوف» column
          would be empty for every row on a normal page and would cost width on
          a table that is already wide on a laptop; sitting next to the name it
          is impossible to miss on exactly the rows where it matters, and
          invisible everywhere else.

          This is the reason `bannedAt` is on `AdminStudentRowSchema` at all —
          without it an operator has to open each student to find out whether
          they are locked out, which is how someone gets told «حسابك شغال» over
          WhatsApp about an account that is not.
        */}
        {row.original.bannedAt ? (
          <Badge tone="err">{copy.admin.students.accessBanned}</Badge>
        ) : null}
      </span>
    ),
  },
  {
    id: 'email',
    accessorKey: 'email',
    header: copy.admin.students.columnEmail,
    enableSorting: false,
  },
  {
    id: 'phone',
    accessorKey: 'phone',
    header: copy.admin.students.columnPhone,
    enableSorting: false,
  },
  {
    id: 'governorate',
    accessorKey: 'governorateNameAr',
    header: copy.admin.students.columnGovernorate,
    enableSorting: true,
  },
  {
    id: 'year',
    header: copy.admin.students.columnYear,
    enableSorting: false,
    cell: ({ row }) => row.original.year ?? '—',
  },
  {
    id: 'track',
    header: copy.admin.students.columnTrack,
    enableSorting: false,
    cell: ({ row }) => row.original.trackLabelAr ?? '—',
  },
  {
    id: 'onboardingCompleted',
    header: copy.admin.students.columnOnboarding,
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={row.original.onboardingCompleted ? 'accent' : 'neutral'}>
        {row.original.onboardingCompleted
          ? copy.admin.students.onboardingDone
          : copy.admin.students.onboardingPending}
      </Badge>
    ),
  },
  {
    id: 'createdAt',
    header: copy.admin.students.columnCreatedAt,
    enableSorting: true,
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('ar-EG'),
  },
];
