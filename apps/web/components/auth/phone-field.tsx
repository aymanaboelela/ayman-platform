'use client';

import type { ChangeEvent } from 'react';
import { toAsciiDigits } from '@ayman/contracts/phone';
import { cn } from '@ayman/ui/lib/cn';
import { FormField, type FormFieldProps } from './form-field';

/**
 * A `<FormField>` for a phone number, which rewrites Arabic-Indic digits to
 * Latin ones as they are typed.
 *
 * ## What actually changes for the student
 *
 * Nothing about whether the number is accepted — `normalizeEgyptianPhone` has
 * always folded ٠١٢ before parsing, and the stored value has always been
 * `+201…`. What changes is that the field now agrees with itself: the
 * placeholder says «مثال: 01012345678», so a field that answers ٠١٠ to a Latin
 * example is asking the student to trust that two different-looking things are
 * the same. On the one form that gates entry to the product, they don't — they
 * clear it and try again, or they leave.
 *
 * ## Why the event is mutated rather than the value controlled
 *
 * The input is uncontrolled: `register()` hands over a `ref`, an `onChange` and
 * nothing else, and react-hook-form reads the value off the DOM node. Writing
 * `event.target.value` before forwarding the event therefore updates BOTH at
 * once — the visible field and the form's own copy — with no second render and
 * no risk of the two disagreeing. Making it controlled would mean lifting the
 * value into React state per keystroke and re-rendering the wizard around it,
 * for a transformation that is a no-op on every Latin keyboard in use.
 *
 * The caret is left alone deliberately. The replacement is one codepoint for
 * one codepoint, so the string length never changes and the browser's own
 * cursor position stays correct — including mid-string edits and paste.
 */
export function PhoneField({ onChange, className, ...props }: FormFieldProps) {
  return (
    <FormField
      {...props}
      type="tel"
      // `numeric`, not `tel`. A `tel` keypad on Android offers the pause/wait
      // characters and, on an Arabic locale, frequently opens on the ٠١٢ pad —
      // which is the thing this component then has to undo on every key. This
      // asks for the plain digit pad first and still leaves the ٠١٢ keyboard
      // usable for anyone whose system insists on it.
      inputMode="numeric"
      // The paragraph direction is RTL and a phone number is a Latin string:
      // without this the leading `+` of a pasted `+201…` renders at the wrong
      // end. `text-start` keeps the field's contents against the same edge as
      // every other input in the column, which is what stops it looking like a
      // field that has been filled in wrong.
      dir="ltr"
      className={cn('text-start', className)}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const ascii = toAsciiDigits(event.target.value);
        if (ascii !== event.target.value) event.target.value = ascii;
        onChange?.(event);
      }}
    />
  );
}
