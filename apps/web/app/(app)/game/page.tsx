import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { GameRoundSchema } from '@ayman/contracts/quiz/game';
import { QuizGame } from '@/components/game/quiz-game';
import { apiGetAuthed } from '@/lib/api-server';
import { featureEnabled } from '@/lib/entitlements';
import '@/components/game/game.css';

const c = copy.game;

export const metadata: Metadata = { title: c.title };

/**
 * «تحدّي الأسئلة».
 *
 * `quizGame` مقفولة افتراضيًا على أي ستاك غير أيمن، فالصفحة بترجع 404 هناك —
 * نفس الحارس اللي على الـAPI (`@RequireFeature('quizGame')`)، عشان اللينك
 * مايوصلش لشاشة فاضية بتقول «مقدرناش نجيب الجولة».
 *
 * الجولة الأولى بتتجاب من السيرفر فالشاشة بتفتح جاهزة؛ «جولة كمان» من
 * المتصفح.
 */
export default async function GamePage() {
  if (!(await featureEnabled('quizGame'))) notFound();
  const round = await apiGetAuthed('/api/me/game/round', GameRoundSchema);

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-4">
        <p className="eyebrow">{c.eyebrow}</p>
        <h1 className="mt-1 text-[length:var(--fs-title-2)] font-bold text-fg">{c.title}</h1>
      </header>
      <QuizGame initial={round} />
    </main>
  );
}
