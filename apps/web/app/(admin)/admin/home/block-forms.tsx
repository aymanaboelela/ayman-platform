'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import type { z } from 'zod';
import {
  CourseGridPropsSchema,
  CtaPropsSchema,
  FaqPropsSchema,
  HeroPropsSchema,
  StatsPropsSchema,
  TestimonialsPropsSchema,
  type HomeBlockProps,
} from '@ayman/contracts/admin/home-blocks';
import { copy } from '@ayman/contracts';
import { Button, DialogFooter, Input, Label, Textarea } from '@ayman/ui';

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

type HeroInput = z.input<typeof HeroPropsSchema>;

export function HeroForm({ defaultValues, onSubmit }: BlockFormProps<HeroInput>) {
  const form = useForm<HeroInput>({ resolver: zodResolver(HeroPropsSchema), defaultValues });

  async function submit(values: HeroInput) {
    await onSubmit(HeroPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-12">
      <div>
        <Label htmlFor="hero-headline">{copy.admin.home.headline}</Label>
        <Input id="hero-headline" {...form.register('headlineAr')} />
      </div>
      <div>
        <Label htmlFor="hero-subheadline">{copy.admin.home.subheadline}</Label>
        <Textarea id="hero-subheadline" {...form.register('subheadlineAr')} />
      </div>
      <div>
        <Label htmlFor="hero-cta-label">{copy.admin.home.ctaLabel}</Label>
        <Input id="hero-cta-label" {...form.register('ctaLabelAr')} />
      </div>
      <div>
        <Label htmlFor="hero-cta-href">{copy.admin.home.ctaHref}</Label>
        <Input id="hero-cta-href" {...form.register('ctaHref')} placeholder="/courses" />
      </div>
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

type CourseGridInput = z.input<typeof CourseGridPropsSchema>;

export function CourseGridForm({ defaultValues, onSubmit }: BlockFormProps<CourseGridInput>) {
  const form = useForm<CourseGridInput>({ resolver: zodResolver(CourseGridPropsSchema), defaultValues });

  async function submit(values: CourseGridInput) {
    await onSubmit(CourseGridPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-12">
      <div>
        <Label htmlFor="grid-title">{copy.admin.home.blockTitle}</Label>
        <Input id="grid-title" {...form.register('titleAr')} />
      </div>
      <div>
        <Label htmlFor="grid-limit">{copy.admin.home.courseLimit}</Label>
        <Input id="grid-limit" type="number" min={1} max={12} {...form.register('limit', { valueAsNumber: true })} />
      </div>
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

type StatsInput = z.input<typeof StatsPropsSchema>;

export function StatsForm({ defaultValues, onSubmit }: BlockFormProps<StatsInput>) {
  const form = useForm<StatsInput>({ resolver: zodResolver(StatsPropsSchema), defaultValues });
  const items = useFieldArray({ control: form.control, name: 'items' });

  async function submit(values: StatsInput) {
    await onSubmit(StatsPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-12">
      <div>
        <Label htmlFor="stats-title">{copy.admin.home.blockTitle}</Label>
        <Input id="stats-title" {...form.register('titleAr')} />
      </div>
      <div className="space-y-8">
        {items.fields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-8">
            <div className="flex-1">
              <Label htmlFor={`stat-label-${field.id}`}>{copy.admin.home.statLabel}</Label>
              <Input id={`stat-label-${field.id}`} {...form.register(`items.${index}.labelAr` as const)} />
            </div>
            <div className="flex-1">
              <Label htmlFor={`stat-value-${field.id}`}>{copy.admin.home.statValue}</Label>
              <Input id={`stat-value-${field.id}`} {...form.register(`items.${index}.value` as const)} />
            </div>
            <Button type="button" variant="danger" size="sm" onClick={() => items.remove(index)}>
              {copy.admin.home.removeItem}
            </Button>
          </div>
        ))}
        {items.fields.length < 4 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => items.append({ labelAr: '', value: '' })}
          >
            {copy.admin.home.addStat}
          </Button>
        ) : null}
      </div>
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

type TestimonialsInput = z.input<typeof TestimonialsPropsSchema>;

export function TestimonialsForm({ defaultValues, onSubmit }: BlockFormProps<TestimonialsInput>) {
  const form = useForm<TestimonialsInput>({ resolver: zodResolver(TestimonialsPropsSchema), defaultValues });
  const items = useFieldArray({ control: form.control, name: 'items' });

  async function submit(values: TestimonialsInput) {
    await onSubmit(TestimonialsPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-12">
      <div>
        <Label htmlFor="testimonials-title">{copy.admin.home.blockTitle}</Label>
        <Input id="testimonials-title" {...form.register('titleAr')} />
      </div>
      <div className="space-y-8">
        {items.fields.map((field, index) => (
          <div key={field.id} className="space-y-4 rounded-[var(--r-md)] border border-line p-8">
            <Label htmlFor={`testimonial-name-${field.id}`}>{copy.admin.home.testimonialName}</Label>
            <Input id={`testimonial-name-${field.id}`} {...form.register(`items.${index}.nameAr` as const)} />
            <Label htmlFor={`testimonial-body-${field.id}`}>{copy.admin.home.testimonialBody}</Label>
            <Textarea id={`testimonial-body-${field.id}`} {...form.register(`items.${index}.bodyAr` as const)} />
            <Button type="button" variant="danger" size="sm" onClick={() => items.remove(index)}>
              {copy.admin.home.removeItem}
            </Button>
          </div>
        ))}
        {items.fields.length < 12 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => items.append({ nameAr: '', bodyAr: '', avatarAssetId: null })}
          >
            {copy.admin.home.addTestimonial}
          </Button>
        ) : null}
      </div>
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

type FaqInput = z.input<typeof FaqPropsSchema>;

export function FaqForm({ defaultValues, onSubmit }: BlockFormProps<FaqInput>) {
  const form = useForm<FaqInput>({ resolver: zodResolver(FaqPropsSchema), defaultValues });
  const items = useFieldArray({ control: form.control, name: 'items' });

  async function submit(values: FaqInput) {
    await onSubmit(FaqPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-12">
      <div>
        <Label htmlFor="faq-title">{copy.admin.home.blockTitle}</Label>
        <Input id="faq-title" {...form.register('titleAr')} />
      </div>
      <div className="space-y-8">
        {items.fields.map((field, index) => (
          <div key={field.id} className="space-y-4 rounded-[var(--r-md)] border border-line p-8">
            <Label htmlFor={`faq-q-${field.id}`}>{copy.admin.home.faqQuestion}</Label>
            <Input id={`faq-q-${field.id}`} {...form.register(`items.${index}.questionAr` as const)} />
            <Label htmlFor={`faq-a-${field.id}`}>{copy.admin.home.faqAnswer}</Label>
            <Textarea id={`faq-a-${field.id}`} {...form.register(`items.${index}.answerAr` as const)} />
            <Button type="button" variant="danger" size="sm" onClick={() => items.remove(index)}>
              {copy.admin.home.removeItem}
            </Button>
          </div>
        ))}
        {items.fields.length < 20 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => items.append({ questionAr: '', answerAr: '' })}
          >
            {copy.admin.home.addFaq}
          </Button>
        ) : null}
      </div>
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}

type CtaInput = z.input<typeof CtaPropsSchema>;

export function CtaForm({ defaultValues, onSubmit }: BlockFormProps<CtaInput>) {
  const form = useForm<CtaInput>({ resolver: zodResolver(CtaPropsSchema), defaultValues });

  async function submit(values: CtaInput) {
    await onSubmit(CtaPropsSchema.parse(values));
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-12">
      <div>
        <Label htmlFor="cta-headline">{copy.admin.home.headline}</Label>
        <Input id="cta-headline" {...form.register('headlineAr')} />
      </div>
      <div>
        <Label htmlFor="cta-label">{copy.admin.home.ctaLabel}</Label>
        <Input id="cta-label" {...form.register('ctaLabelAr')} />
      </div>
      <div>
        <Label htmlFor="cta-href">{copy.admin.home.ctaHref}</Label>
        <Input id="cta-href" {...form.register('ctaHref')} placeholder="/courses" />
      </div>
      <SaveButton pending={form.formState.isSubmitting} />
    </form>
  );
}
