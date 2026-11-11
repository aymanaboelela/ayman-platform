import { describe, expect, it } from 'vitest';
import { parsePanelTab } from './panel-tabs';

describe('parsePanelTab', () => {
  it('is closed when the param is absent', () => {
    expect(parsePanelTab(undefined)).toBeNull();
  });

  it('opens the named tab', () => {
    expect(parsePanelTab('exams')).toBe('exams');
    expect(parsePanelTab(['courses', 'exams'])).toBe('courses');
  });

  it('opens on the first tab for a value it does not know', () => {
    expect(parsePanelTab('')).toBe('overview');
    expect(parsePanelTab('nonsense')).toBe('overview');
  });
});
