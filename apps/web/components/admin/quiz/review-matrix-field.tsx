'use client';

import {
  DEFAULT_REVIEW_OPTIONS,
  REVIEW_FLAGS,
  REVIEW_WINDOWS,
  copy,
  type ReviewFlag,
  type ReviewOptions,
  type ReviewWindow,
} from '@ayman/contracts';
import { Button, Checkbox, Label } from '@ayman/ui';

export interface ReviewMatrixFieldProps {
  value: ReviewOptions;
  onChange: (next: ReviewOptions) => void;
}

/**
 * A 4×7 checkbox grid — windows as columns, flags as rows, resolved
 * SERVER-SIDE at read time (`resolveReviewFlags`). This is the authoring
 * surface for that same matrix; it decides nothing about what a learner
 * ultimately sees, it only writes the settings row the server reads later.
 */
export function ReviewMatrixField({ value, onChange }: ReviewMatrixFieldProps) {
  function toggle(window: ReviewWindow, flag: ReviewFlag) {
    onChange({
      ...value,
      [window]: { ...value[window], [flag]: !value[window][flag] },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>{copy.quizAdmin.reviewMatrix}</Label>
        {/*
          One reset, not two. There used to be a "practice" preset beside this
          one that opened the `during` window; practice mode is gone, and a
          preset that re-creates its answer-revealing matrix by name would be
          the fastest way to bring it back by accident. An instructor who wants
          mid-attempt feedback still ticks `during · correctness` deliberately.
        */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange(DEFAULT_REVIEW_OPTIONS)}
        >
          {copy.quizAdmin.reviewMatrixReset}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-sm border border-line-subtle">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="mono border-b border-line-subtle p-2 text-start text-[length:var(--fs-mono-label)] text-fg-muted">
                {copy.quizAdmin.reviewMatrix}
              </th>
              {REVIEW_WINDOWS.map((window) => (
                <th
                  key={window}
                  className="mono border-b border-line-subtle p-2 text-center text-[length:var(--fs-mono-label)] text-fg-muted"
                >
                  {copy.quizAdmin.windows[window]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REVIEW_FLAGS.map((flag) => (
              <tr key={flag}>
                <th className="border-b border-line-subtle p-2 text-start font-normal text-fg">
                  {copy.quizAdmin.flags[flag]}
                </th>
                {REVIEW_WINDOWS.map((window) => (
                  <td key={window} className="border-b border-line-subtle p-2 text-center">
                    <Checkbox
                      checked={value[window][flag]}
                      onCheckedChange={() => toggle(window, flag)}
                      aria-label={`${copy.quizAdmin.flags[flag]} — ${copy.quizAdmin.windows[window]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
