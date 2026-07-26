'use client';

import { createContext, useContext, useId, type ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * The Standard Schema issue shape. Zod 4 emits `path: PropertyKey[]`; ArkType
 * and Valibot may emit `path: { key: PropertyKey }[]`. Accepting both is the
 * whole reason this component needs no resolver adapter.
 */
export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

function pathToName(path: StandardSchemaIssue['path']): string {
  if (!path) return '';
  return path
    .map((segment) =>
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? String(segment.key)
        : String(segment),
    )
    .join('.');
}

/** Every issue whose path names this field. Pure, so it is trivially testable. */
export function issuesForPath(
  issues: readonly StandardSchemaIssue[],
  name: string,
): StandardSchemaIssue[] {
  return issues.filter((issue) => pathToName(issue.path) === name);
}

interface FieldContextValue {
  controlId: string;
  errorId: string;
  descriptionId: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useFieldContext(component: string): FieldContextValue {
  const context = useContext(FieldContext);
  if (!context) throw new Error(`<${component}> must be rendered inside a <Field>`);
  return context;
}

export function FieldSet({ className, ...props }: ComponentProps<'fieldset'>) {
  return <fieldset className={cn('flex flex-col gap-4 border-0 p-0', className)} {...props} />;
}

export function FieldLegend({ className, ...props }: ComponentProps<'legend'>) {
  return (
    <legend
      className={cn('mb-2 text-[length:var(--fs-title-4)] font-semibold', className)}
      {...props}
    />
  );
}

export function FieldGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)} {...props} />;
}

/**
 * ⚠️ `dir` inheritance only — this must never set a physical `text-left`/
 * `text-right`. It renders `dir="rtl"` implicitly via the ambient `<html
 * dir="rtl">`, never its own directional override.
 */
export function Field({
  name,
  issues = [],
  className,
  children,
  ...props
}: ComponentProps<'div'> & { name: string; issues?: readonly StandardSchemaIssue[] }) {
  const generatedId = useId();
  const own = issuesForPath(issues, name);

  return (
    <FieldContext.Provider
      value={{
        controlId: `${generatedId}-control`,
        errorId: `${generatedId}-error`,
        descriptionId: `${generatedId}-description`,
        invalid: own.length > 0,
      }}
    >
      <div className={cn('flex flex-col gap-1', className)} {...props}>
        {children}
        <FieldError issues={own} />
      </div>
    </FieldContext.Provider>
  );
}

export function FieldLabel({ className, ...props }: ComponentProps<'label'>) {
  const { controlId } = useFieldContext('FieldLabel');
  return (
    <label
      htmlFor={controlId}
      className={cn('text-[length:var(--fs-text-sm)] font-medium text-fg', className)}
      {...props}
    />
  );
}

export function FieldDescription({ className, ...props }: ComponentProps<'p'>) {
  const { descriptionId } = useFieldContext('FieldDescription');
  return (
    <p
      id={descriptionId}
      className={cn('text-[length:var(--fs-text-xs)] text-fg-muted', className)}
      {...props}
    />
  );
}

/**
 * Wires a control into the field: id, aria-invalid, aria-describedby.
 * Consumers spread this onto <Input>, <Select> etc. rather than the components
 * reaching into context themselves, which keeps the primitives context-free.
 */
export function useFieldControlProps(): {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string;
} {
  const { controlId, errorId, descriptionId, invalid } = useFieldContext('useFieldControlProps');
  return {
    id: controlId,
    'aria-invalid': invalid,
    'aria-describedby': invalid ? errorId : descriptionId,
  };
}

/**
 * Renders raw Standard Schema issues. `aria-live="polite"` so a screen reader
 * announces a server-returned error without stealing focus. `--err` is the
 * one sanctioned non-quiz use of red — a form error is not quiz correctness,
 * and this is where that carve-out is documented.
 */
export function FieldError({
  issues,
  className,
  ...props
}: ComponentProps<'p'> & { issues: readonly StandardSchemaIssue[] }) {
  const { errorId } = useFieldContext('FieldError');
  if (issues.length === 0) return null;

  return (
    <p
      id={errorId}
      role="alert"
      aria-live="polite"
      className={cn('text-[length:var(--fs-text-xs)] text-err', className)}
      {...props}
    >
      {issues.map((issue) => issue.message).join(' · ')}
    </p>
  );
}
