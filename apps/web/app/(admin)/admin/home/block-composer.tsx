'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { HomeBlock, HomeBlockProps, HOME_BLOCK_TYPES } from '@ayman/contracts/admin/home-blocks';
import { copy } from '@ayman/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@ayman/ui';
import { SortableList, type SortableHandleProps } from '@/components/admin/sortable-list';
import type { ReorderStatus } from '@/components/admin/use-debounced-reorder';
import { BlockPreview } from './block-preview';
import {
  AboutForm,
  CourseGridForm,
  CtaForm,
  FaqForm,
  HeroForm,
  PlacementOnlyForm,
  StatsForm,
  TestimonialsForm,
  WhyRailForm,
} from './block-forms';
import {
  archiveHomeBlockAction,
  createHomeBlockAction,
  patchHomeBlockAction,
  reorderHomeBlocksAction,
  restoreHomeBlockAction,
  seedDefaultHomeBlocksAction,
  setHomeBlockPublishedAction,
} from './actions';

type BlockType = (typeof HOME_BLOCK_TYPES)[number];

const TYPE_LABEL: Record<BlockType, string> = {
  hero: copy.admin.home.blockTypeHero,
  whyRail: copy.admin.home.blockTypeWhyRail,
  courseGrid: copy.admin.home.blockTypeCourseGrid,
  instructor: copy.admin.home.blockTypeInstructor,
  yearTracks: copy.admin.home.blockTypeYearTracks,
  about: copy.admin.home.blockTypeAbout,
  stats: copy.admin.home.blockTypeStats,
  testimonials: copy.admin.home.blockTypeTestimonials,
  faq: copy.admin.home.blockTypeFaq,
  cta: copy.admin.home.blockTypeCta,
};

const DEFAULT_PROPS: Record<BlockType, HomeBlockProps> = {
  hero: {
    type: 'hero',
    eyebrowAr: '',
    headlineAr: '',
    subheadlineAr: '',
    rotatingAr: [],
    leadAr: '',
    ctaLabelAr: '',
    ctaHref: '/register',
    secondaryCtaLabelAr: '',
    secondaryCtaHref: '/courses',
    stats: [],
    imageAssetId: null,
  },
  whyRail: {
    type: 'whyRail',
    titleAr: '',
    titleAccentAr: '',
    leadAr: '',
    leadSecondaryAr: '',
    items: [
      { titleAr: '', bodyAr: '' },
      { titleAr: '', bodyAr: '' },
    ],
  },
  courseGrid: { type: 'courseGrid', titleAr: '', leadAr: '', ctaLabelAr: '', courseIds: [], limit: 6 },
  instructor: { type: 'instructor' },
  yearTracks: { type: 'yearTracks' },
  about: { type: 'about', titleAr: '', body1Ar: '', body2Ar: '', roleAr: '', chipsAr: [] },
  stats: { type: 'stats', titleAr: '', items: [{ labelAr: '', value: '' }] },
  testimonials: { type: 'testimonials', titleAr: '', items: [{ nameAr: '', bodyAr: '', avatarAssetId: null }] },
  faq: { type: 'faq', eyebrowAr: '', titleAr: '', items: [{ questionAr: '', answerAr: '' }] },
  cta: { type: 'cta', headlineAr: '', leadAr: '', ctaLabelAr: '', ctaHref: '/register' },
};

function PropsForm({ props, onSubmit }: { props: HomeBlockProps; onSubmit: (next: HomeBlockProps) => Promise<void> }) {
  switch (props.type) {
    case 'hero':
      return <HeroForm defaultValues={props} onSubmit={onSubmit} />;
    case 'whyRail':
      return <WhyRailForm defaultValues={props} onSubmit={onSubmit} />;
    case 'courseGrid':
      return <CourseGridForm defaultValues={props} onSubmit={onSubmit} />;
    case 'instructor':
    case 'yearTracks':
      return <PlacementOnlyForm defaultValues={props} onSubmit={onSubmit} />;
    case 'about':
      return <AboutForm defaultValues={props} onSubmit={onSubmit} />;
    case 'stats':
      return <StatsForm defaultValues={props} onSubmit={onSubmit} />;
    case 'testimonials':
      return <TestimonialsForm defaultValues={props} onSubmit={onSubmit} />;
    case 'faq':
      return <FaqForm defaultValues={props} onSubmit={onSubmit} />;
    case 'cta':
      return <CtaForm defaultValues={props} onSubmit={onSubmit} />;
  }
}

function EditBlockDialog({ block }: { block: HomeBlock }) {
  const [open, setOpen] = useState(false);

  async function onSubmit(props: HomeBlockProps) {
    const result = await patchHomeBlockAction(block.id, { props });
    if (result.ok) {
      toast.success(copy.admin.home.saveSuccess);
      setOpen(false);
    } else {
      toast.error(copy.admin.home.saveFailed);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          {copy.admin.taxonomy.edit}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{TYPE_LABEL[block.props.type]}</DialogTitle>
        </DialogHeader>
        <PropsForm props={block.props} onSubmit={onSubmit} />
      </DialogContent>
    </Dialog>
  );
}

function AddBlockDialog({ type, open, onOpenChange }: { type: BlockType; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [key, setKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);

  async function onSubmit(props: HomeBlockProps) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) {
      setKeyError(copy.admin.home.keyHint);
      return;
    }
    const result = await createHomeBlockAction({ key, isPublished: false, props });
    if (result.ok) {
      toast.success(copy.admin.home.saveSuccess);
      onOpenChange(false);
      setKey('');
    } else {
      toast.error(copy.admin.home.saveFailed);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{TYPE_LABEL[type]}</DialogTitle>
        </DialogHeader>
        <div className="mb-3">
          <Label htmlFor="block-key">{copy.admin.home.keyLabel}</Label>
          <Input id="block-key" value={key} onChange={(event) => setKey(event.target.value)} placeholder="hero-main" />
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.admin.home.keyHint}</p>
          {keyError ? <p className="text-[length:var(--fs-text-xs)] text-err">{keyError}</p> : null}
        </div>
        <PropsForm props={DEFAULT_PROPS[type]} onSubmit={onSubmit} />
      </DialogContent>
    </Dialog>
  );
}

function BlockRow({ block, handleProps }: { block: HomeBlock; handleProps: SortableHandleProps }) {
  const [pending, setPending] = useState(false);

  async function togglePublish() {
    setPending(true);
    const result = await setHomeBlockPublishedAction(block.id, !block.isPublished);
    setPending(false);
    if (!result.ok) toast.error(copy.admin.home.saveFailed);
  }

  async function archiveWithUndo() {
    if (!window.confirm(copy.admin.home.archiveConfirm)) return;
    const result = await archiveHomeBlockAction(block.id);
    if (!result.ok) {
      toast.error(copy.admin.home.saveFailed);
      return;
    }
    toast.success(copy.admin.home.archived, {
      action: { label: copy.admin.navigation.archiveUndo, onClick: () => void restoreHomeBlockAction(block.id) },
    });
  }

  return (
    // `min-w-0` on every column is load-bearing, not defensive: a grid item's
    // default `min-width: auto` refuses to shrink below its content, so the
    // preview's card row (and the block key's `font-mono` string) pushed the
    // whole row wider than the track and spilled out of the card.
    <div className="grid grid-cols-1 gap-4 rounded-[var(--r-lg)] border border-line bg-surface-2 p-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex min-w-0 items-start gap-2">
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
        <div className="min-w-0">
          <p className="truncate font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
            {block.key}
          </p>
          <p className="text-[length:var(--fs-text-sm)] text-fg">{TYPE_LABEL[block.props.type]}</p>
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={block.isPublished ? 'accent' : 'neutral'}>
            {block.isPublished ? copy.admin.home.published : copy.admin.home.unpublished}
          </Badge>
          <Button type="button" variant="secondary" size="sm" onClick={() => void togglePublish()} disabled={pending}>
            {block.isPublished ? copy.admin.home.unpublish : copy.admin.home.publish}
          </Button>
          <EditBlockDialog block={block} />
          <Button type="button" variant="danger" size="sm" onClick={() => void archiveWithUndo()}>
            {copy.admin.actions.archive}
          </Button>
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-1 text-[length:var(--fs-text-xs)] text-fg-muted">{copy.admin.home.preview}</p>
        <BlockPreview props={block.props} />
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

/**
 * Shown while `home_blocks` is empty. The public page is NOT broken in that
 * state — it renders `DEFAULT_HOME_BLOCKS` — so this explains that and offers
 * the one-click conversion rather than presenting an empty list as a problem.
 */
function EmptyState() {
  const [pending, setPending] = useState(false);

  async function seed() {
    setPending(true);
    const result = await seedDefaultHomeBlocksAction();
    setPending(false);
    if (result.ok) toast.success(copy.admin.home.seeded);
    else toast.error(copy.admin.home.saveFailed);
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-dashed border-line bg-surface-2 p-6 text-center">
      <p className="font-[var(--fw-medium)] text-fg">{copy.admin.home.emptyTitle}</p>
      <p className="mx-auto mt-2 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">
        {copy.admin.home.emptyBody}
      </p>
      <Button type="button" className="mt-4" disabled={pending} onClick={() => void seed()}>
        {pending ? copy.admin.home.seeding : copy.admin.home.emptyCta}
      </Button>
    </div>
  );
}

export function BlockComposer({ blocks }: { blocks: HomeBlock[] }) {
  const [pendingType, setPendingType] = useState<BlockType | null>(null);

  if (blocks.length === 0) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button">{copy.admin.home.addBlock}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(Object.keys(TYPE_LABEL) as BlockType[]).map((type) => (
              <DropdownMenuItem key={type} onSelect={() => setPendingType(type)}>
                {TYPE_LABEL[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {pendingType ? (
        <AddBlockDialog
          type={pendingType}
          open={pendingType !== null}
          onOpenChange={(open) => {
            if (!open) setPendingType(null);
          }}
        />
      ) : null}

      <SortableList
        items={blocks}
        onReorder={(ids) => reorderHomeBlocksAction(ids)}
        renderItem={(block, handleProps) => <BlockRow block={block} handleProps={handleProps} />}
        announcements={{
          pickedUp: (position) => `${copy.admin.reorder.pickedUp} ${position}`,
          movedOver: (position) => `${copy.admin.reorder.movedOver} ${position}`,
          dropped: (position) => `${copy.admin.reorder.dropped} ${position}`,
          cancelled: copy.admin.reorder.cancelled,
        }}
        statusSlot={(status) => (
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.admin.reorder.hint}</p>
            <p aria-live="polite" className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
              {STATUS_LABEL[status]}
            </p>
          </div>
        )}
      />
    </div>
  );
}
