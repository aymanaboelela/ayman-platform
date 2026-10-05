import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { AdminChallengeTopics } from '@ayman/contracts/quiz/challenges';

const createChallengeAction = vi.fn();
const updateChallengeAction = vi.fn();
vi.mock('./challenge-actions', () => ({
  createChallengeAction: (...args: unknown[]) => createChallengeAction(...args),
  updateChallengeAction: (...args: unknown[]) => updateChallengeAction(...args),
  deleteChallengeAction: vi.fn(),
  reorderChallengesAction: vi.fn(),
}));

const { ChallengeTopics } = await import('./challenge-topics');

const c = copy.admin.challenges;
const COURSE = '01990000-0000-7000-8000-0000000c0001';
const UNIT = '01990000-0000-7000-8000-0000000d0001';
const L1 = '01990000-0000-7000-8000-0000000e0001';
const L2 = '01990000-0000-7000-8000-0000000e0002';

const lesson = (id: string, title: string, ready: number) => ({ id, title, kind: 'video', ready, forGeneral: true, forLanguages: true });

const detail: AdminChallengeTopics = {
  courseId: COURSE,
  courseTitle: 'البرمجة',
  foundation: false,
  sections: [{ id: UNIT, title: 'الوحدة الأولى', ready: 20, lessons: [lesson(L1, 'الدرس الأول', 12), lesson(L2, 'الدرس التاني', 8)] }],
  topics: [
    {
      id: '01990000-0000-7000-8000-0000000f0001',
      title: 'الدرس التاني بس',
      isActive: true,
      position: 0,
      sectionIds: [],
      lessonIds: [L2],
      missing: 0,
      ready: { total: 8, general: 8, languages: 8 },
    },
  ],
};

afterEach(() => {
  cleanup();
  createChallengeAction.mockReset();
  updateChallengeAction.mockReset();
});

describe('ChallengeTopics — the admin «قسم التحديات»', () => {
  it('warns which games a small topic cannot feed', () => {
    render(<ChallengeTopics initial={detail} />);
    // ٨ أسئلة: أقل من المليون (١٥) — والباقي كفاية.
    expect(screen.getByText(new RegExp(formatCopy(c.modeMillionaire, { n: 15 }).replace(/[()]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.queryByText(c.enough)).toBeNull();
  });

  it('builds a topic from a whole unit, counting what students will get, and refuses an empty one', async () => {
    createChallengeAction.mockResolvedValue({ ok: true, detail });
    render(<ChallengeTopics initial={detail} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(c.add) }));

    fireEvent.change(screen.getByRole('textbox', { name: c.nameLabel }), { target: { value: 'الوحدة الأولى' } });
    fireEvent.click(screen.getByRole('button', { name: c.create }));
    expect(screen.getByText(c.needScope)).toBeInTheDocument();
    expect(createChallengeAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: /الوحدة الأولى/ }));
    // الوحدة كلها = الدرسين: ١٢ + ٨.
    expect(screen.getByText(formatCopy(c.readyTotal, { n: 20 }))).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: c.create }));
    });
    expect(createChallengeAction).toHaveBeenCalledWith(COURSE, {
      title: 'الوحدة الأولى',
      sectionIds: [UNIT],
      lessonIds: [],
      isActive: true,
    });
  });

  it('switches a topic off for students with one press', async () => {
    updateChallengeAction.mockResolvedValue({ ok: true, detail });
    render(<ChallengeTopics initial={detail} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch'));
    });
    expect(updateChallengeAction).toHaveBeenCalledWith(COURSE, detail.topics[0]!.id, { isActive: false });
  });

  it('says the foundation course has no challenges instead of offering a form', () => {
    render(<ChallengeTopics initial={{ ...detail, foundation: true }} />);
    expect(screen.getByText(c.foundation)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(c.add) })).toBeNull();
  });
});
