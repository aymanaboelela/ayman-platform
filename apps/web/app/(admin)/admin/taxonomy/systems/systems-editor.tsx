'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  AcademicYearPatchSchema,
  SystemPatchSchema,
  type AcademicYearPatch,
  type SystemPatch,
} from '@ayman/contracts/admin/taxonomy';
import { copy } from '@ayman/contracts';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@ayman/ui';
import { patchAcademicYearAction, patchSystemAction } from '../actions';

interface AcademicYearRow {
  id: string;
  year: number;
  labelAr: string;
  badgeAr: string;
  sortOrder: number;
}

interface SystemRow {
  id: string;
  slug: string;
  nameAr: string;
  totalMarks: number;
  passPercent: number;
  allowsRetakes: boolean;
  sortOrder: number;
  years: AcademicYearRow[];
}

function YearEditDialog({ year }: { year: AcademicYearRow }) {
  const [open, setOpen] = useState(false);
  const form = useForm<AcademicYearPatch>({
    resolver: zodResolver(AcademicYearPatchSchema),
    defaultValues: { labelAr: year.labelAr, badgeAr: year.badgeAr, sortOrder: year.sortOrder },
  });

  async function onSubmit(values: AcademicYearPatch) {
    const result = await patchAcademicYearAction(year.id, values);
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
          <DialogTitle>{year.labelAr}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-12">
          <div>
            <Label htmlFor={`year-label-${year.id}`}>{copy.admin.taxonomy.columnName}</Label>
            <Input id={`year-label-${year.id}`} {...form.register('labelAr')} />
          </div>
          <div>
            <Label htmlFor={`year-badge-${year.id}`}>{copy.admin.taxonomy.columnName}</Label>
            <Input id={`year-badge-${year.id}`} {...form.register('badgeAr')} />
          </div>
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

function SystemEditDialog({ system }: { system: SystemRow }) {
  const [open, setOpen] = useState(false);
  const form = useForm<SystemPatch>({
    resolver: zodResolver(SystemPatchSchema),
    defaultValues: {
      nameAr: system.nameAr,
      totalMarks: system.totalMarks,
      passPercent: system.passPercent,
      allowsRetakes: system.allowsRetakes,
      sortOrder: system.sortOrder,
    },
  });

  async function onSubmit(values: SystemPatch) {
    const result = await patchSystemAction(system.id, values);
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
          <DialogTitle>{system.nameAr}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-12">
          <div>
            <Label htmlFor={`sys-name-${system.id}`}>{copy.admin.taxonomy.columnName}</Label>
            <Input id={`sys-name-${system.id}`} {...form.register('nameAr')} />
          </div>
          <div>
            <Label htmlFor={`sys-marks-${system.id}`}>{copy.admin.taxonomy.columnTotalMarks}</Label>
            <Input
              id={`sys-marks-${system.id}`}
              type="number"
              {...form.register('totalMarks', { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor={`sys-pass-${system.id}`}>{copy.admin.taxonomy.columnPassPercent}</Label>
            <Input
              id={`sys-pass-${system.id}`}
              type="number"
              step="0.1"
              {...form.register('passPercent', { valueAsNumber: true })}
            />
          </div>
          <label className="flex items-center gap-8">
            <Checkbox
              checked={form.watch('allowsRetakes')}
              onCheckedChange={(checked) => form.setValue('allowsRetakes', checked === true)}
            />
            <span className="text-[length:var(--fs-text-sm)] text-fg">
              {copy.admin.taxonomy.columnAllowsRetakes}
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

export function SystemsEditor({ systems }: { systems: SystemRow[] }) {
  return (
    <div className="space-y-24">
      {systems.map((system) => (
        <Card key={system.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-8">
            <div>
              <CardTitle>{system.nameAr}</CardTitle>
              <p className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">{system.slug}</p>
            </div>
            <SystemEditDialog system={system} />
          </CardHeader>
          <CardBody>
            <p className="mb-8 text-[length:var(--fs-text-sm)] text-fg-muted">
              {copy.admin.taxonomy.academicYearsTitle}
            </p>
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.admin.students.columnYear}</TableHead>
                    <TableHead>{copy.admin.taxonomy.columnName}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {system.years.map((year) => (
                    <TableRow key={year.id}>
                      <TableCell className="tabular-nums">{year.year}</TableCell>
                      <TableCell>{year.labelAr}</TableCell>
                      <TableCell>
                        <YearEditDialog year={year} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
