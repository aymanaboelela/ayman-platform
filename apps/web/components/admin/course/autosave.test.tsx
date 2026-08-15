import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveProvider, useAutosave, useAutosaveSummary } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

/**
 * A field that saves a string, plus a read-out of the shared summary — the two
 * halves of the contract, so a test can assert what the header says at the same
 * time as what reached the server.
 */
function Field({
  onSave,
  values,
}: {
  onSave: (value: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  values: string[];
}) {
  const { save } = useAutosave<string>({ onSave });
  return (
    <>
      {values.map((value) => (
        <button key={value} type="button" onClick={() => save(value)}>
          {`type-${value}`}
        </button>
      ))}
    </>
  );
}

function Indicator() {
  const summary = useAutosaveSummary();
  return (
    <>
      <span data-testid="status">{summary.status}</span>
      <span data-testid="error">{summary.error ?? ''}</span>
      <button type="button" onClick={summary.retry}>
        retry
      </button>
    </>
  );
}

function type(value: string) {
  act(() => {
    screen.getByText(`type-${value}`).click();
  });
}

/** Push past the debounce and let the resolved promise's `.then` run. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

describe('useAutosave', () => {
  it('coalesces a burst of edits into ONE write carrying the last value', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(
      <AutosaveProvider>
        <Field onSave={onSave} values={['a', 'b', 'c']} />
      </AutosaveProvider>,
    );

    type('a');
    type('b');
    type('c');
    expect(onSave).not.toHaveBeenCalled();

    await settle();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('c');
  });

  it('serialises writes: an edit made mid-flight is sent after the first lands, not beside it', async () => {
    let release: ((result: { ok: true }) => void) | undefined;
    const onSave = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: true }>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue({ ok: true });

    render(
      <AutosaveProvider>
        <Field onSave={onSave} values={['first', 'second']} />
      </AutosaveProvider>,
    );

    type('first');
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);

    // Typed while the first write is still travelling.
    type('second');
    await settle();
    // Still one — the second is queued behind the first, not racing it.
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.({ ok: true });
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(2, 'second');
  });

  it('keeps a failed value so retry re-sends it, and does not retry on its own', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'الشبكة وقعت' })
      .mockResolvedValue({ ok: true });

    render(
      <AutosaveProvider>
        <Field onSave={onSave} values={['x']} />
        <Indicator />
      </AutosaveProvider>,
    );

    type('x');
    await settle();

    expect(screen.getByTestId('status').textContent).toBe('error');
    expect(screen.getByTestId('error').textContent).toBe('الشبكة وقعت');

    // A failed write must NOT come back round on the timer — a 400 retried on a
    // loop hammers the API with a payload it has already refused.
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      screen.getByText('retry').click();
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(2, 'x');
    expect(screen.getByTestId('status').textContent).toBe('saved');
  });

  it('flushes an unsent edit when the field unmounts', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    const { unmount } = render(
      <AutosaveProvider>
        <Field onSave={onSave} values={['late']} />
      </AutosaveProvider>,
    );

    type('late');
    // Deliberately NOT advancing the timer: this is the "collapsed the panel
    // half a second after typing" case, which used to lose the edit.
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });

    expect(onSave).toHaveBeenCalledWith('late');
  });

  it('reports saving then saved to the shared summary', async () => {
    let release: ((result: { ok: true }) => void) | undefined;
    const onSave = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          release = resolve;
        }),
    );

    render(
      <AutosaveProvider>
        <Field onSave={onSave} values={['v']} />
        <Indicator />
      </AutosaveProvider>,
    );

    expect(screen.getByTestId('status').textContent).toBe('idle');

    type('v');
    expect(screen.getByTestId('status').textContent).toBe('pending');

    await settle();
    expect(screen.getByTestId('status').textContent).toBe('saving');

    await act(async () => {
      release?.({ ok: true });
    });
    expect(screen.getByTestId('status').textContent).toBe('saved');
  });

  it('saves without a provider, so a form rendered on its own still works', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<Field onSave={onSave} values={['solo']} />);

    type('solo');
    await settle();

    expect(onSave).toHaveBeenCalledWith('solo');
  });
});
