import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Entitlements } from '@ayman/contracts/admin/entitlements';
import { StudentFeaturesSync, useStudentFeatureGate, type StudentNavFlags } from './student-features';

/**
 * The rail's gate for a FLAG row — «ساحة التحدي» on a teacher stack whose
 * owner switched `arena.enabled` on from `/admin/flags`. Before, the row was
 * not in the table at all off Ayman's stack, so the switch opened a page no
 * student could find.
 */

function Probe() {
  const allowed = useStudentFeatureGate();
  return (
    <ul>
      <li data-testid="plain">{String(allowed({}))}</li>
      <li data-testid="arena">{String(allowed({ flag: 'arena.enabled' }))}</li>
      <li data-testid="mistakes">{String(allowed({ flag: 'mistakes.enabled' }))}</li>
      <li data-testid="game">{String(allowed({ feature: 'quizGame' }))}</li>
    </ul>
  );
}

const features = { quizGame: false } as Entitlements;

afterEach(cleanup);

describe('useStudentFeatureGate with flags', () => {
  it('shows a flag row only when the stack reports the flag on', () => {
    const flags: StudentNavFlags = { 'arena.enabled': true, 'mistakes.enabled': false };
    render(
      <>
        <StudentFeaturesSync features={features} flags={flags} />
        <Probe />
      </>,
    );
    expect(screen.getByTestId('plain').textContent).toBe('true');
    expect(screen.getByTestId('arena').textContent).toBe('true');
    expect(screen.getByTestId('mistakes').textContent).toBe('false');
    expect(screen.getByTestId('game').textContent).toBe('false');
  });

  it('follows the switch when the slot answers again', () => {
    const { rerender } = render(
      <>
        <StudentFeaturesSync features={features} flags={{ 'arena.enabled': false, 'mistakes.enabled': false }} />
        <Probe />
      </>,
    );
    expect(screen.getByTestId('arena').textContent).toBe('false');
    act(() => {
      rerender(
        <>
          <StudentFeaturesSync features={features} flags={{ 'arena.enabled': true, 'mistakes.enabled': false }} />
          <Probe />
        </>,
      );
    });
    expect(screen.getByTestId('arena').textContent).toBe('true');
  });
});
