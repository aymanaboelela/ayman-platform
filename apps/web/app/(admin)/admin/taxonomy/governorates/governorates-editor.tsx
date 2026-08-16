'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GovernoratePatchSchema, type GovernoratePatch } from '@ayman/contracts/admin/taxonomy';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@ayman/ui/components/table';
import { patchGovernorateAction } from '../actions';

interface GovernorateRow {
  code: string;
  nameAr: string;
  slug: string;
  region: 'urban' | 'lower' | 'upper' | 'frontier';
  sortOrder: number;
  isActive: boolean;
}

const REGION_LABEL = {
  urban: copy.admin.taxonomy.regionUrban,
  lower: copy.admin.taxonomy.regionLower,
  upper: copy.admin.taxonomy.regionUpper,
  frontier: copy.admin.taxonomy.regionFrontier,
} as const;

function GovernorateEditDialog({ row }: { row: GovernorateRow }) {
  const [open, setOpen] = useState(false);
  const form = useForm<GovernoratePatch>({
    resolver: zodResolver(GovernoratePatchSchema),
    defaultValues: {
      nameAr: row.nameAr,
      region: row.region,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    },
  });

  async function onSubmit(values: GovernoratePatch) {
    const result = await patchGovernorateAction(row.code, values);
    if (result.ok) {
      toast.success(copy.admin.taxonomy.saveSuccess);
      setOpen(false);
    } else {
      toast.error(copy.admin.taxonomy.saveFailed);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {copy.admin.taxonomy.edit}
      </Button>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{row.nameAr}</DialogTitle>
        </DialogHeader>

        <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3">
          <div>
            <Label htmlFor={`nameAr-${row.code}`}>{copy.admin.taxonomy.columnName}</Label>
            <Input id={`nameAr-${row.code}`} {...form.register('nameAr')} />
            {form.formState.errors.nameAr ? (
              <p className="text-[length:var(--fs-text-xs)] text-err">
                {form.formState.errors.nameAr.message}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor={`region-${row.code}`}>{copy.admin.taxonomy.columnRegion}</Label>
            <Select id={`region-${row.code}`} {...form.register('region')}>
              {Object.entries(REGION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`sortOrder-${row.code}`}>{copy.admin.taxonomy.columnSortOrder}</Label>
            <Input
              id={`sortOrder-${row.code}`}
              type="number"
              {...form.register('sortOrder', { valueAsNumber: true })}
            />
          </div>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={form.watch('isActive')}
              onCheckedChange={(checked) => form.setValue('isActive', checked === true)}
            />
            <span className="text-[length:var(--fs-text-sm)] text-fg">
              {copy.admin.taxonomy.columnActive}
            </span>
          </label>

          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? copy.admin.actions.saving : copy.admin.actions.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GovernoratesEditor({ governorates }: { governorates: GovernorateRow[] }) {
  return (
    <TableWrapper>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{copy.admin.taxonomy.columnName}</TableHead>
            <TableHead>{copy.admin.taxonomy.columnSlug}</TableHead>
            <TableHead>{copy.admin.taxonomy.columnRegion}</TableHead>
            <TableHead>{copy.admin.taxonomy.columnActive}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {governorates.map((row) => (
            <TableRow key={row.code}>
              <TableCell>{row.nameAr}</TableCell>
              <TableCell className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
                {row.slug}
              </TableCell>
              <TableCell>{REGION_LABEL[row.region]}</TableCell>
              <TableCell>
                <Badge tone={row.isActive ? 'accent' : 'neutral'}>
                  {row.isActive ? copy.admin.taxonomy.active : copy.admin.taxonomy.inactive}
                </Badge>
              </TableCell>
              <TableCell>
                <GovernorateEditDialog row={row} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrapper>
  );
}
