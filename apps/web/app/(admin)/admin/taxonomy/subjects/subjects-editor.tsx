'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  SubjectCreateSchema,
  SubjectPatchSchema,
  type SubjectCreate,
  type SubjectPatch,
} from '@ayman/contracts/admin/taxonomy';
import { copy } from '@ayman/contracts';
import {
  Button,
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
import { createSubjectAction, deleteSubjectAction, patchSubjectAction } from '../actions';

interface SubjectRow {
  id: string;
  slug: string;
  nameAr: string;
  aliases: string[];
}

function SubjectEditDialog({ subject }: { subject: SubjectRow }) {
  const [open, setOpen] = useState(false);
  const form = useForm<SubjectPatch>({
    resolver: zodResolver(SubjectPatchSchema),
    defaultValues: { nameAr: subject.nameAr, aliases: subject.aliases },
  });

  async function onSubmit(values: SubjectPatch) {
    const result = await patchSubjectAction(subject.id, values);
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
          <DialogTitle>{subject.nameAr}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3">
          <div>
            <Label htmlFor={`subject-name-${subject.id}`}>{copy.admin.taxonomy.columnName}</Label>
            <Input id={`subject-name-${subject.id}`} {...form.register('nameAr')} />
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

type SubjectCreateInput = z.input<typeof SubjectCreateSchema>;

function SubjectCreateDialog() {
  const [open, setOpen] = useState(false);
  const form = useForm<SubjectCreateInput>({
    resolver: zodResolver(SubjectCreateSchema),
    defaultValues: { slug: '', nameAr: '', aliases: [] },
  });

  // Re-parsed so the schema's `.default([])` applies — `SubjectCreate` (the
  // action's parameter type) is the OUTPUT type, not the form's input type.
  async function onSubmit(values: SubjectCreateInput) {
    const parsed: SubjectCreate = SubjectCreateSchema.parse(values);
    const result = await createSubjectAction(parsed);
    if (result.ok) {
      toast.success(copy.admin.taxonomy.saveSuccess);
      form.reset();
      setOpen(false);
    } else {
      toast.error(copy.admin.taxonomy.saveFailed);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" onClick={() => setOpen(true)}>
        {copy.admin.taxonomy.newSubject}
      </Button>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.admin.taxonomy.newSubject}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3">
          <div>
            <Label htmlFor="new-subject-name">{copy.admin.taxonomy.columnName}</Label>
            <Input id="new-subject-name" {...form.register('nameAr')} />
          </div>
          <div>
            <Label htmlFor="new-subject-slug">{copy.admin.taxonomy.columnSlug}</Label>
            <Input id="new-subject-slug" {...form.register('slug')} placeholder="mathematics" />
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.admin.taxonomy.slugHint}</p>
            {form.formState.errors.slug ? (
              <p className="text-[length:var(--fs-text-xs)] text-err">
                {form.formState.errors.slug.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? copy.admin.actions.saving : copy.admin.actions.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSubjectButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (!window.confirm(copy.admin.taxonomy.deleteConfirm)) return;
    setPending(true);
    const result = await deleteSubjectAction(id);
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.actions.delete);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Button type="button" variant="danger" size="sm" onClick={() => void onDelete()} disabled={pending}>
      {copy.admin.actions.delete}
    </Button>
  );
}

export function SubjectsEditor({ subjects }: { subjects: SubjectRow[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SubjectCreateDialog />
      </div>
      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.admin.taxonomy.columnName}</TableHead>
              <TableHead>{copy.admin.taxonomy.columnSlug}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {subjects.map((subject) => (
              <TableRow key={subject.id}>
                <TableCell>{subject.nameAr}</TableCell>
                <TableCell className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
                  {subject.slug}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <SubjectEditDialog subject={subject} />
                    <DeleteSubjectButton id={subject.id} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>
    </div>
  );
}
