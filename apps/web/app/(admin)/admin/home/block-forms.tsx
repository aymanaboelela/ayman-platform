'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import {
  AboutPropsSchema,
  CourseGridPropsSchema,
  CtaPropsSchema,
  FaqPropsSchema,
  HeroPropsSchema,
  StatsPropsSchema,
  TestimonialsPropsSchema,
  WhyRailPropsSchema,
  type HomeBlockProps,
} from '@ayman/contracts/admin/home-blocks';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { DialogFooter } from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Textarea } from '@ayman/ui/components/textarea';

const h = copy.admin.home;

export interface BlockFormProps<T> {
  defaultValues: T;
  onSubmit: (props: HomeBlockProps) => Promise<void>;
  submitting?: boolean;
}

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <DialogFooter>
      <Button type="submit" disabled={pending}>
        {pending ? copy.admin.actions.saving : copy.admin.actions.save}
      </Button>
    </DialogFooter>
  );
}

/**
 * Surfaces the first validation error as text rather than leaving the dialog
 * looking inert. Every one of these forms lives inside a modal, and a silent
 * `handleSubmit` that refuses to fire because a nested `items[2].bodyAr` is
 * empty reads to an editor as "the save button is broken".
 */
function FormErrors<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  const count = Object.keys(form.formState.errors).length;
  if (count === 0) return null;
  return (
    <p role="alert" className="text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
      {copy.admin.common.required}
    </p>
  );
}

/** A labelled text row. Every form below is mostly these. */
function Row({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/* ── hero ────────────────────────────────────────────────────────────────── */

type HeroInput = z.input<typeof HeroPropsSchema>;

export function HeroForm({ defaultValues, onSubmit }: BlockFormProps<HeroInput>) {
  const form = useForm<HeroInput>({ resolver: zodResolver(HeroPropsSchema), defaultValues });
  const rotating = useFieldArray({ control: form.control, name: 'rotatingAr' as never });
  const stats = useFieldArray({ control: form.control, name: 'stats' });

  async function submit(values: HeroInput) {
    await onSubmit(HeroPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-3">
      <Row id="hero-eyebrow" label={h.eyebrow}>
        <Input id="hero-eyebrow" {...form.register('eyebrowAr')} />
      </Row>
      <Row id="hero-headline" label={h.headline}>
        <Input id="hero-headline" {...form.register('headlineAr')} />
      </Row>
      <Row id="hero-subheadline" label={h.subheadline}>
        <Input id="hero-subheadline" {...form.register('subheadlineAr')} />
      </Row>

      <div className="space-y-2">
        <Label>{h.rotating}</Label>
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{h.rotatingHint}</p>
        {rotating.fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2">
            <Input
              aria-label={`${h.rotating} ${index + 1}`}
              {...form.register(`rotatingAr.${index}` as const)}
            />
            <Button type="button" variant="danger" size="sm" onClick={() => rotating.remove(index)}>
              {h.removeItem}
            </Button>
          </div>
        ))}
        {rotating.fields.length < 6 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => rotating.append('' as never)}
          >
            {h.addRotating}
          </Button>
        ) : null}
      </div>

      <Row id="hero-lead" label={h.blockLead}>
        <Textarea id="hero-lead" {...form.register('leadAr')} />
      </Row>
      <Row id="hero-cta-label" label={h.ctaLabel}>
        <Input id="hero-cta-label" {...form.register('ctaLabelAr')} />
      </Row>
      <Row id="hero-cta-href" label={h.ctaHref}>
        <Input id="hero-cta-href" {...form.register('ctaHref')} placeholder="/register" />
      </Row>
      <Row id="hero-cta2-label" label={h.secondaryCtaLabel}>
        <Input id="hero-cta2-label" {...form.register('secondaryCtaLabelAr')} />
      </Row>
      <Row id="hero-cta2-href" label={h.secondaryCtaHref}>
        <Input id="hero-cta2-href" {...form.register('secondaryCtaHref')} placeholder="/courses" />
      </Row>

      <div className="space-y-2">
        <Label>{h.heroStats}</Label>
        {stats.fields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`hero-stat-value-${field.id}`}>{h.statValue}</Label>
              <Input
                id={`hero-stat-value-${field.id}`}
                {...form.register(`stats.${index}.value` as const)}
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor={`hero-stat-label-${field.id}`}>{h.statLabel}</Label>
              <Input
                id={`hero-stat-label-${field.id}`}
                {...form.register(`stats.${index}.labelAr` as const)}
              />
            </div>
            <Button type="button" variant="danger" size="sm" onClick={() => stats.remove(index)}>
              {h.removeItem}
            </Button>
          </div>
        ))}
        {stats.fields.length < 4 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => stats.append({ value: '', labelAr: '' })}
          >
            {h.addHeroStat}
          </Button>
        ) : null}
      </div>

      <FormErrors form={form} />
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

/* ── why rail ────────────────────────────────────────────────────────────── */

type WhyRailInput = z.input<typeof WhyRailPropsSchema>;

export function WhyRailForm({ defaultValues, onSubmit }: BlockFormProps<WhyRailInput>) {
  const form = useForm<WhyRailInput>({ resolver: zodResolver(WhyRailPropsSchema), defaultValues });
  const items = useFieldArray({ control: form.control, name: 'items' });

  async function submit(values: WhyRailInput) {
    await onSubmit(WhyRailPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-3">
      <Row id="why-title" label={h.blockTitle}>
        <Input id="why-title" {...form.register('titleAr')} />
      </Row>
      <Row id="why-accent" label={h.titleAccent}>
        <Input id="why-accent" {...form.register('titleAccentAr')} />
      </Row>
      <Row id="why-lead" label={h.blockLead}>
        <Textarea id="why-lead" {...form.register('leadAr')} />
      </Row>
      <Row id="why-lead-2" label={h.leadSecondary}>
        <Textarea id="why-lead-2" {...form.register('leadSecondaryAr')} />
      </Row>

      <div className="space-y-2">
        {items.fields.map((field, index) => (
          <div key={field.id} className="space-y-1 rounded-[var(--r-md)] border border-line p-2">
            <Label htmlFor={`why-item-title-${field.id}`}>{h.featureTitle}</Label>
            <Input
              id={`why-item-title-${field.id}`}
              {...form.register(`items.${index}.titleAr` as const)}
            />
            <Label htmlFor={`why-item-body-${field.id}`}>{h.featureBody}</Label>
            <Textarea
              id={`why-item-body-${field.id}`}
              {...form.register(`items.${index}.bodyAr` as const)}
            />
            {items.fields.length > 2 ? (
              <Button type="button" variant="danger" size="sm" onClick={() => items.remove(index)}>
                {h.removeItem}
              </Button>
            ) : null}
          </div>
        ))}
        {items.fields.length < 12 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => items.append({ titleAr: '', bodyAr: '' })}
          >
            {h.addFeature}
          </Button>
        ) : null}
      </div>

      <FormErrors form={form} />
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

/* ── course grid ─────────────────────────────────────────────────────────── */

type CourseGridInput = z.input<typeof CourseGridPropsSchema>;

export function CourseGridForm({ defaultValues, onSubmit }: BlockFormProps<CourseGridInput>) {
  const form = useForm<CourseGridInput>({
    resolver: zodResolver(CourseGridPropsSchema),
    defaultValues,
  });

  async function submit(values: CourseGridInput) {
    await onSubmit(CourseGridPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-3">
      <Row id="grid-title" label={h.blockTitle}>
        <Input id="grid-title" {...form.register('titleAr')} />
      </Row>
      <Row id="grid-lead" label={h.blockLead}>
        <Textarea id="grid-lead" {...form.register('leadAr')} />
      </Row>
      <Row id="grid-cta" label={h.ctaLabel}>
        <Input id="grid-cta" {...form.register('ctaLabelAr')} />
      </Row>
      <Row id="grid-limit" label={h.courseLimit}>
        <Input
          id="grid-limit"
          type="number"
          min={1}
          max={12}
          {...form.register('limit', { valueAsNumber: true })}
        />
      </Row>
      <FormErrors form={form} />
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

/* ── about ───────────────────────────────────────────────────────────────── */

type AboutInput = z.input<typeof AboutPropsSchema>;

export function AboutForm({ defaultValues, onSubmit }: BlockFormProps<AboutInput>) {
  const form = useForm<AboutInput>({ resolver: zodResolver(AboutPropsSchema), defaultValues });
  const chips = useFieldArray({ control: form.control, name: 'chipsAr' as never });

  async function submit(values: AboutInput) {
    await onSubmit(AboutPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-3">
      <Row id="about-title" label={h.blockTitle}>
        <Input id="about-title" {...form.register('titleAr')} />
      </Row>
      <Row id="about-body-1" label={h.aboutBody1}>
        <Textarea id="about-body-1" {...form.register('body1Ar')} />
      </Row>
      <Row id="about-body-2" label={h.aboutBody2}>
        <Textarea id="about-body-2" {...form.register('body2Ar')} />
      </Row>
      <Row id="about-role" label={h.aboutRole}>
        <Input id="about-role" {...form.register('roleAr')} />
      </Row>

      <div className="space-y-2">
        <Label>{h.aboutChips}</Label>
        {chips.fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2">
            <Input
              aria-label={`${h.aboutChips} ${index + 1}`}
              {...form.register(`chipsAr.${index}` as const)}
            />
            <Button type="button" variant="danger" size="sm" onClick={() => chips.remove(index)}>
              {h.removeItem}
            </Button>
          </div>
        ))}
        {chips.fields.length < 4 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => chips.append('' as never)}
          >
            {h.addChip}
          </Button>
        ) : null}
      </div>

      <FormErrors form={form} />
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

/* ── stats ───────────────────────────────────────────────────────────────── */

type StatsInput = z.input<typeof StatsPropsSchema>;

export function StatsForm({ defaultValues, onSubmit }: BlockFormProps<StatsInput>) {
  const form = useForm<StatsInput>({ resolver: zodResolver(StatsPropsSchema), defaultValues });
  const items = useFieldArray({ control: form.control, name: 'items' });

  async function submit(values: StatsInput) {
    await onSubmit(StatsPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-3">
      <Row id="stats-title" label={h.blockTitle}>
        <Input id="stats-title" {...form.register('titleAr')} />
      </Row>
      <div className="space-y-2">
        {items.fields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`stat-label-${field.id}`}>{h.statLabel}</Label>
              <Input
                id={`stat-label-${field.id}`}
                {...form.register(`items.${index}.labelAr` as const)}
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor={`stat-value-${field.id}`}>{h.statValue}</Label>
              <Input
                id={`stat-value-${field.id}`}
                {...form.register(`items.${index}.value` as const)}
              />
            </div>
            {items.fields.length > 1 ? (
              <Button type="button" variant="danger" size="sm" onClick={() => items.remove(index)}>
                {h.removeItem}
              </Button>
            ) : null}
          </div>
        ))}
        {items.fields.length < 4 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => items.append({ labelAr: '', value: '' })}
          >
            {h.addStat}
          </Button>
        ) : null}
      </div>
      <FormErrors form={form} />
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

/* ── testimonials ────────────────────────────────────────────────────────── */

type TestimonialsInput = z.input<typeof TestimonialsPropsSchema>;

export function TestimonialsForm({ defaultValues, onSubmit }: BlockFormProps<TestimonialsInput>) {
  const form = useForm<TestimonialsInput>({
    resolver: zodResolver(TestimonialsPropsSchema),
    defaultValues,
  });
  const items = useFieldArray({ control: form.control, name: 'items' });

  async function submit(values: TestimonialsInput) {
    await onSubmit(TestimonialsPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-3">
      <Row id="testimonials-title" label={h.blockTitle}>
        <Input id="testimonials-title" {...form.register('titleAr')} />
      </Row>
      <div className="space-y-2">
        {items.fields.map((field, index) => (
          <div key={field.id} className="space-y-1 rounded-[var(--r-md)] border border-line p-2">
            <Label htmlFor={`testimonial-name-${field.id}`}>{h.testimonialName}</Label>
            <Input
              id={`testimonial-name-${field.id}`}
              {...form.register(`items.${index}.nameAr` as const)}
            />
            <Label htmlFor={`testimonial-body-${field.id}`}>{h.testimonialBody}</Label>
            <Textarea
              id={`testimonial-body-${field.id}`}
              {...form.register(`items.${index}.bodyAr` as const)}
            />
            {items.fields.length > 1 ? (
              <Button type="button" variant="danger" size="sm" onClick={() => items.remove(index)}>
                {h.removeItem}
              </Button>
            ) : null}
          </div>
        ))}
        {items.fields.length < 12 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => items.append({ nameAr: '', bodyAr: '', avatarAssetId: null })}
          >
            {h.addTestimonial}
          </Button>
        ) : null}
      </div>
      <FormErrors form={form} />
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

/* ── faq ─────────────────────────────────────────────────────────────────── */

type FaqInput = z.input<typeof FaqPropsSchema>;

export function FaqForm({ defaultValues, onSubmit }: BlockFormProps<FaqInput>) {
  const form = useForm<FaqInput>({ resolver: zodResolver(FaqPropsSchema), defaultValues });
  const items = useFieldArray({ control: form.control, name: 'items' });

  async function submit(values: FaqInput) {
    await onSubmit(FaqPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-3">
      <Row id="faq-eyebrow" label={h.eyebrow}>
        <Input id="faq-eyebrow" {...form.register('eyebrowAr')} />
      </Row>
      <Row id="faq-title" label={h.blockTitle}>
        <Input id="faq-title" {...form.register('titleAr')} />
      </Row>
      <div className="space-y-2">
        {items.fields.map((field, index) => (
          <div key={field.id} className="space-y-1 rounded-[var(--r-md)] border border-line p-2">
            <Label htmlFor={`faq-q-${field.id}`}>{h.faqQuestion}</Label>
            <Input id={`faq-q-${field.id}`} {...form.register(`items.${index}.questionAr` as const)} />
            <Label htmlFor={`faq-a-${field.id}`}>{h.faqAnswer}</Label>
            <Textarea id={`faq-a-${field.id}`} {...form.register(`items.${index}.answerAr` as const)} />
            {items.fields.length > 1 ? (
              <Button type="button" variant="danger" size="sm" onClick={() => items.remove(index)}>
                {h.removeItem}
              </Button>
            ) : null}
          </div>
        ))}
        {items.fields.length < 20 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => items.append({ questionAr: '', answerAr: '' })}
          >
            {h.addFaq}
          </Button>
        ) : null}
      </div>
      <FormErrors form={form} />
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

/* ── cta ─────────────────────────────────────────────────────────────────── */

type CtaInput = z.input<typeof CtaPropsSchema>;

export function CtaForm({ defaultValues, onSubmit }: BlockFormProps<CtaInput>) {
  const form = useForm<CtaInput>({ resolver: zodResolver(CtaPropsSchema), defaultValues });

  async function submit(values: CtaInput) {
    await onSubmit(CtaPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-3">
      <Row id="cta-headline" label={h.headline}>
        <Input id="cta-headline" {...form.register('headlineAr')} />
      </Row>
      <Row id="cta-lead" label={h.blockLead}>
        <Textarea id="cta-lead" {...form.register('leadAr')} />
      </Row>
      <Row id="cta-label" label={h.ctaLabel}>
        <Input id="cta-label" {...form.register('ctaLabelAr')} />
      </Row>
      <Row id="cta-href" label={h.ctaHref}>
        <Input id="cta-href" {...form.register('ctaHref')} placeholder="/register" />
      </Row>
      <FormErrors form={form} />
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

/* ── placement-only ──────────────────────────────────────────────────────── */

/**
 * `instructor` and `yearTracks` have no editable props at all — see the module
 * comment in `packages/contracts/src/admin/home-blocks.ts`. The dialog still
 * needs a submit path so the block can be CREATED from the composer, so this
 * renders the explanation plus the same save button every other form has.
 */
export function PlacementOnlyForm({
  defaultValues,
  onSubmit,
}: BlockFormProps<{ type: 'instructor' | 'yearTracks' }>) {
  const form = useForm({ defaultValues });

  return (
    <form onSubmit={form.handleSubmit(() => onSubmit(defaultValues))} noValidate className="space-y-3">
      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{h.placementOnly}</p>
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}
