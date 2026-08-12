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
      <Link href={`/admin/students/${row.original.id}`} className="font-[var(--fw-medium)] text-fg hover:underline">
        {row.original.fullName}
      </Link>
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
