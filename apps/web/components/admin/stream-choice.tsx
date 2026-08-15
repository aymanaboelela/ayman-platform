import { copy } from '@ayman/contracts/copy';
import { StreamChoiceSchema, streamChoiceOf } from '@ayman/contracts/content';
import type { StreamChoice } from '@ayman/contracts/content';

const c = copy.stream;

const LABELS: Record<StreamChoice, string> = {
  general: c.general,
  languages: c.languages,
  both: c.both,
};

/**
 * «المدارس» — عام, لغات, or both, as three radios in one segmented control.
 *
 * ## Radios, not two checkboxes
 *
 * Two checkboxes can be unticked into the state `*_serves_a_stream` rejects,
 * and the form would then have to scold the teacher for a click it offered.
 * Three exclusive options make that state unreachable rather than merely
 * invalid — the same move the CHECK makes, one layer up. `streamFlagsOf()` in
 * the action expands the choice back into the pair the column stores.
 *
 * ## Uncontrolled, with `defaultChecked`
 *
 * Every other field in these forms is uncontrolled and read from `FormData` on
 * submit; a controlled island here would need its own state and would still
 * submit through the same path. `required` on all three is what makes a create
 * form with nothing selected fail in the browser rather than at the CHECK —
 * radios of one name share the constraint, so ticking any of them satisfies it.
 */
export function StreamChoiceField({
  name = 'stream',
  idPrefix,
  defaults,
  onChange,
}: {
  name?: string;
  /** Radio ids must be unique per page — lesson rows render many of these. */
  idPrefix: string;
  /** Reads the stored pair. Absent (a create form) means «الاتنين». */
  defaults?: { forGeneral: boolean; forLanguages: boolean };
  /**
   * Present only where there is no submit to read `FormData` on — the
   * autosaving editors hold the choice in their own draft. The field stays
   * uncontrolled either way: `defaultChecked` sets the `checked` ATTRIBUTE,
   * which a native form reset restores correctly, unlike a controlled
   * `<select>` whose reset falls through to its first option.
   */
  onChange?: (choice: StreamChoice) => void;
}) {
  const current = streamChoiceOf(defaults ?? { forGeneral: true, forLanguages: true });

  return (
    <fieldset className="stream-field">
      <legend className="stream-field__legend">{c.label}</legend>
      <div className="stream-field__options">
        {StreamChoiceSchema.options.map((choice) => (
          <label key={choice} className="stream-field__option" htmlFor={`${idPrefix}-${choice}`}>
            <input
              type="radio"
              id={`${idPrefix}-${choice}`}
              name={name}
              value={choice}
              defaultChecked={current === choice}
              onChange={onChange && (() => onChange(choice))}
              required
            />
            <span>{LABELS[choice]}</span>
          </label>
        ))}
      </div>
      <p className="stream-field__hint">{c.hint}</p>
    </fieldset>
  );
}
