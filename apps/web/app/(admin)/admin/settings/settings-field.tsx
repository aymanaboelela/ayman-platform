'use client';

import type { ReactElement } from 'react';
import type { FieldErrors } from 'react-hook-form';
import {
  Field,
  FieldDescription,
  FieldLabel,
  useFieldControlProps,
  type StandardSchemaIssue,
} from '@ayman/ui';

/**
 * Flat RHF errors -> the `StandardSchemaIssue[]` shape `<Field>` expects.
 * `BrandingSchema`/`SeoSchema`/`ContactSchema` are all single-level objects
 * (no nested fields), so a top-level `path: [key]` is exact here, not an
 * approximation of a deeper structure.
 */
export function issuesFromErrors(errors: FieldErrors): StandardSchemaIssue[] {
  return Object.entries(errors).flatMap(([key, err]) =>
    err?.message ? [{ path: [key], message: String(err.message) }] : [],
  );
}

type ControlProps = ReturnType<typeof useFieldControlProps>;

export interface SettingsFieldProps {
  name: string;
  label: string;
  description?: string;
  issues: readonly StandardSchemaIssue[];
  render: (controlProps: ControlProps) => ReactElement;
}

/**
 * One `<Field>` per settings input. Wires id/aria-invalid/aria-describedby
 * and the per-field error render through the shared `packages/ui` primitives
 * instead of every settings form re-deriving that plumbing by hand.
 *
 * `useFieldControlProps()` must be called by a component that renders AS A
 * CHILD of `<Field>` — its context provider wraps `children`, and a hook call
 * made directly in the calling form's own render function would resolve
 * against whatever context is ABOVE the form, not the `<Field>` it is about
 * to render below itself. `ControlSlot` is that child.
 */
export function SettingsField({ name, label, description, issues, render }: SettingsFieldProps) {
  return (
    <Field name={name} issues={issues}>
      <FieldLabel>{label}</FieldLabel>
      <ControlSlot render={render} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function ControlSlot({ render }: Pick<SettingsFieldProps, 'render'>) {
  const controlProps = useFieldControlProps();
  return render(controlProps);
}
