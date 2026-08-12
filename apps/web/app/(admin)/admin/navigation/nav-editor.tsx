'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  NavigationCreateSchema,
  type NavigationCreate,
  type NavigationTree,
} from '@ayman/contracts/admin/navigation';
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
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { SortableList, type SortableHandleProps } from '@/components/admin/sortable-list';
import type { ReorderStatus } from '@/components/admin/use-debounced-reorder';
import {
  archiveNavItemAction,
  createNavItemAction,
  patchNavItemAction,
  reorderNavAction,
  restoreNavItemAction,
} from './actions';

type NavNode = NavigationTree[number];
type NavLeaf = NavNode['children'][number];
type NavigationFormInput = z.input<typeof NavigationCreateSchema>;

const ANNOUNCEMENTS = {
  pickedUp: (position: number) => `${copy.admin.reorder.pickedUp} ${position}`,
  movedOver: (position: number) => `${copy.admin.reorder.movedOver} ${position}`,
  dropped: (position: number) => `${copy.admin.reorder.dropped} ${position}`,
  cancelled: copy.admin.reorder.cancelled,
};

function DragHandle({ handleProps }: { handleProps: SortableHandleProps }) {
  return (
    <button
      type="button"
      aria-label={copy.admin.reorder.handle}
      className="cursor-grab rounded-xs px-2 py-1 text-fg-muted focus-visible:outline-2"
      {...handleProps.attributes}
      {...handleProps.listeners}
    >
      <span aria-hidden="true" className="block h-px w-16 bg-current" />
      <span aria-hidden="true" className="mt-1 block h-px w-16 bg-current" />
    </button>
  );
}

function NavItemForm({
  parentId,
  item,
  permissionOptions,
  onDone,
}: {
  parentId: string | null;
  item?: NavLeaf | NavNode;
  permissionOptions: readonly string[];
  onDone: () => void;
}) {
  const form = useForm<NavigationFormInput>({
    resolver: zodResolver(NavigationCreateSchema),
    defaultValues: {
      parentId,
      labelAr: item?.labelAr ?? '',
      href: item?.href ?? '/',
      icon: item?.icon ?? null,
      visibleTo: item?.visibleTo ?? [],
      isPublished: item?.isPublished ?? true,
    },
  });

  // Re-parsed (not merely cast) so the schema's `.default()`s apply —
  // `NavigationCreate` (the actions' parameter type) is the OUTPUT type,
  // which is not identical to the form's INPUT type wherever a field has one.
  async function onSubmit(values: NavigationFormInput) {
    const parsed: NavigationCreate = NavigationCreateSchema.parse(values);
    const result = item ? await patchNavItemAction(item.id, parsed) : await createNavItemAction(parsed);
    if (result.ok) {
      toast.success(copy.admin.navigation.saveSuccess);
      onDone();
    } else {
      toast.error(copy.admin.navigation.saveFailed);
    }
  }

  const visibleTo = form.watch('visibleTo') ?? [];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3">
      <div>
        <Label htmlFor="nav-label">{copy.admin.navigation.label}</Label>
        <Input id="nav-label" {...form.register('labelAr')} />
      </div>
      <div>
        <Label htmlFor="nav-href">{copy.admin.navigation.href}</Label>
        <Input id="nav-href" {...form.register('href')} placeholder="/courses" />
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.admin.navigation.hrefHint}</p>
        {form.formState.errors.href ? (
          <p className="text-[length:var(--fs-text-xs)] text-err">{form.formState.errors.href.message}</p>
        ) : null}
      </div>
      <div>
        <Label htmlFor="nav-icon">{copy.admin.navigation.icon}</Label>
        <Input
          id="nav-icon"
          value={form.watch('icon') ?? ''}
          onChange={(event) => form.setValue('icon', event.target.value || null)}
        />
      </div>

      {permissionOptions.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-[length:var(--fs-text-sm)] font-[var(--fw-medium)] text-fg">
            {copy.admin.navigation.visibleTo}
          </legend>
          <p className="mb-2 text-[length:var(--fs-text-xs)] text-fg-muted">
            {copy.admin.navigation.visibleToHint}
          </p>
          <div className="grid max-h-[200px] grid-cols-2 gap-2 overflow-y-auto">
            {permissionOptions.map((permission) => (
              <label key={permission} className="flex items-center gap-2 text-[length:var(--fs-text-sm)]">
                <Checkbox
                  checked={visibleTo.includes(permission)}
                  onCheckedChange={(checked) => {
                    const next =
                      checked === true
                        ? [...visibleTo, permission]
                        : visibleTo.filter((entry) => entry !== permission);
                    form.setValue('visibleTo', next);
                  }}
                />
                <span className="font-mono text-[length:var(--fs-mono-label)]">{permission}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <label className="flex items-center gap-2">
        <Checkbox
          checked={form.watch('isPublished')}
          onCheckedChange={(checked) => form.setValue('isPublished', checked === true)}
        />
        <span className="text-[length:var(--fs-text-sm)] text-fg">{copy.admin.navigation.published}</span>
      </label>

      <DialogFooter>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? copy.admin.actions.saving : copy.admin.actions.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

function NavItemDialog({
  trigger,
  parentId,
  item,
  permissionOptions,
}: {
  trigger: React.ReactNode;
  parentId: string | null;
  item?: NavLeaf | NavNode;
  permissionOptions: readonly string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{item ? copy.admin.navigation.editItem : copy.admin.navigation.newItem}</DialogTitle>
        </DialogHeader>
        <NavItemForm
          parentId={parentId}
          item={item}
          permissionOptions={permissionOptions}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function useArchiveWithUndo() {
  return async function archiveWithUndo(id: string) {
    if (!window.confirm(copy.admin.navigation.archiveConfirm)) return;
    const result = await archiveNavItemAction(id);
    if (!result.ok) {
      toast.error(copy.admin.navigation.saveFailed);
      return;
    }
    toast.success(copy.admin.navigation.archived, {
      action: {
        label: copy.admin.navigation.archiveUndo,
        onClick: () => void restoreNavItemAction(id),
      },
    });
  };
}

function ChildRow({
  child,
  handleProps,
  permissionOptions,
}: {
  child: NavLeaf;
  handleProps: SortableHandleProps;
  permissionOptions: readonly string[];
}) {
  const archiveWithUndo = useArchiveWithUndo();

  return (
    <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-line bg-surface-3 p-2">
      <DragHandle handleProps={handleProps} />
      <span className="min-w-0 flex-1 truncate text-fg">{child.labelAr}</span>
      <span className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">{child.href}</span>
      <Badge tone={child.isPublished ? 'accent' : 'neutral'}>
        {child.isPublished ? copy.admin.navigation.published : copy.admin.home.unpublished}
      </Badge>
      <NavItemDialog
        trigger={
          <Button type="button" variant="secondary" size="sm">
            {copy.admin.taxonomy.edit}
          </Button>
        }
        parentId={child.parentId}
        item={child}
        permissionOptions={permissionOptions}
      />
      <Button type="button" variant="danger" size="sm" onClick={() => void archiveWithUndo(child.id)}>
        {copy.admin.actions.archive}
      </Button>
    </div>
  );
}

function TopLevelRow({
  node,
  handleProps,
  permissionOptions,
}: {
  node: NavNode;
  handleProps: SortableHandleProps;
  permissionOptions: readonly string[];
}) {
  const archiveWithUndo = useArchiveWithUndo();

  return (
    <div className="rounded-[var(--r-lg)] border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <DragHandle handleProps={handleProps} />
        <span className="min-w-0 flex-1 truncate font-[var(--fw-medium)] text-fg">{node.labelAr}</span>
        <span className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">{node.href}</span>
        <Badge tone={node.isPublished ? 'accent' : 'neutral'}>
          {node.isPublished ? copy.admin.navigation.published : copy.admin.home.unpublished}
        </Badge>
        <NavItemDialog
          trigger={
            <Button type="button" variant="secondary" size="sm">
              {copy.admin.taxonomy.edit}
            </Button>
          }
          parentId={null}
          item={node}
          permissionOptions={permissionOptions}
        />
        <Button type="button" variant="danger" size="sm" onClick={() => void archiveWithUndo(node.id)}>
          {copy.admin.actions.archive}
        </Button>
      </div>

      <div className="mt-3 ms-6 space-y-2">
        {node.children.length === 0 ? (
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {copy.admin.navigation.emptyChildren}
          </p>
        ) : (
          <SortableList
            items={node.children}
            onReorder={(ids) => reorderNavAction(node.id, ids)}
            renderItem={(child, handleProps) => (
              <ChildRow child={child} handleProps={handleProps} permissionOptions={permissionOptions} />
            )}
            announcements={ANNOUNCEMENTS}
          />
        )}
        <NavItemDialog
          trigger={
            <Button type="button" variant="ghost" size="sm">
              {copy.admin.navigation.newChild}
            </Button>
          }
          parentId={node.id}
          permissionOptions={permissionOptions}
        />
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<ReorderStatus, string> = {
  idle: '',
  pending: copy.admin.common.saving,
  saving: copy.admin.common.saving,
  saved: copy.admin.common.saved,
  error: copy.admin.common.saveFailed,
};

export function NavEditor({
  tree,
  permissionOptions,
}: {
  tree: NavigationTree;
  permissionOptions: readonly string[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NavItemDialog
          trigger={<Button type="button">{copy.admin.navigation.newItem}</Button>}
          parentId={null}
          permissionOptions={permissionOptions}
        />
      </div>

      <SortableList
        items={tree}
        onReorder={(ids) => reorderNavAction(null, ids)}
        renderItem={(node, handleProps) => (
          <TopLevelRow node={node} handleProps={handleProps} permissionOptions={permissionOptions} />
        )}
        announcements={ANNOUNCEMENTS}
        statusSlot={(status) => (
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.admin.reorder.hint}</p>
            <p
              aria-live="polite"
              className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted"
            >
              {STATUS_LABEL[status]}
            </p>
          </div>
        )}
      />
    </div>
  );
}
