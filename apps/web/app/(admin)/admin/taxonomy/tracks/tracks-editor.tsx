'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  TrackCreateSchema,
  TrackPatchSchema,
  type TrackCreate,
  type TrackPatch,
} from '@ayman/contracts/admin/taxonomy';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
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
import { createTrackAction, patchTrackAction } from '../actions';

interface TrackRow {
  id: string;
  systemId: string;
  slug: string;
  labelAr: string;
  aliases: string[];
  minYear: number;
  sortOrder: number;
}

interface SystemOption {
  id: string;
  nameAr: string;
}

function TrackEditDialog({ track }: { track: TrackRow }) {
  const [open, setOpen] = useState(false);
  const form = useForm<TrackPatch>({
    resolver: zodResolver(TrackPatchSchema),
    defaultValues: { labelAr: track.labelAr, minYear: track.minYear, sortOrder: track.sortOrder },
  });

  async function onSubmit(values: TrackPatch) {
    const result = await patchTrackAction(track.id, values);
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
          <DialogTitle>{track.labelAr}</DialogTitle>
        </DialogHeader>
        <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3">
          <p className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
            {copy.admin.taxonomy.slugImmutable}: {track.slug}
          </p>
          <div>
            <Label htmlFor={`track-label-${track.id}`}>{copy.admin.taxonomy.columnName}</Label>
            <Input id={`track-label-${track.id}`} {...form.register('labelAr')} />
          </div>
          <div>
            <Label htmlFor={`track-min-year-${track.id}`}>{copy.admin.taxonomy.columnMinYear}</Label>
            <Select id={`track-min-year-${track.id}`} {...form.register('minYear', { valueAsNumber: true })}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </Select>
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

type TrackCreateInput = z.input<typeof TrackCreateSchema>;

function TrackCreateDialog({ systems }: { systems: SystemOption[] }) {
  const [open, setOpen] = useState(false);
  const form = useForm<TrackCreateInput>({
    resolver: zodResolver(TrackCreateSchema),
    defaultValues: {
      systemId: systems[0]?.id ?? '',
      slug: '',
      labelAr: '',
      aliases: [],
      minYear: 2,
      sortOrder: 0,
    },
  });

  // Re-parsed (not merely cast) so the DEFAULTS `.default([])` etc. apply —
  // `TrackCreate` (the action's parameter type) is the schema's OUTPUT type,
  // which is not identical to the form's INPUT type whenever a field has a
  // zod `.default()`.
  async function onSubmit(values: TrackCreateInput) {
    const parsed: TrackCreate = TrackCreateSchema.parse(values);
    const result = await createTrackAction(parsed);
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
        {copy.admin.taxonomy.newTrack}
      </Button>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.admin.taxonomy.newTrack}</DialogTitle>
        </DialogHeader>
        <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3">
          <div>
            <Label htmlFor="new-track-system">{copy.admin.taxonomy.columnSystem}</Label>
            <Select id="new-track-system" {...form.register('systemId')}>
              {systems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="new-track-label">{copy.admin.taxonomy.columnName}</Label>
            <Input id="new-track-label" {...form.register('labelAr')} />
          </div>
          <div>
            <Label htmlFor="new-track-slug">{copy.admin.taxonomy.columnSlug}</Label>
            <Input id="new-track-slug" {...form.register('slug')} placeholder="science-math" />
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

export function TracksEditor({ tracks, systems }: { tracks: TrackRow[]; systems: SystemOption[] }) {
  const systemName = (id: string) => systems.find((system) => system.id === id)?.nameAr ?? '—';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TrackCreateDialog systems={systems} />
      </div>
      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.admin.taxonomy.columnName}</TableHead>
              <TableHead>{copy.admin.taxonomy.columnSystem}</TableHead>
              <TableHead>{copy.admin.taxonomy.columnSlug}</TableHead>
              <TableHead>{copy.admin.taxonomy.columnMinYear}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tracks.map((track) => (
              <TableRow key={track.id}>
                <TableCell>{track.labelAr}</TableCell>
                <TableCell>{systemName(track.systemId)}</TableCell>
                <TableCell className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
                  {track.slug}
                </TableCell>
                <TableCell className="tabular-nums">{track.minYear}</TableCell>
                <TableCell>
                  <TrackEditDialog track={track} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>
    </div>
  );
}
