import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { GameHubSchema } from '@ayman/contracts/quiz/game';
import { GamesHub } from '@/components/game/games-hub';
import { apiGetAuthed } from '@/lib/api-server';
import { featureEnabled } from '@/lib/entitlements';
import '@/components/game/game.css';

const c = copy.game;

export const metadata: Metadata = { title: c.hubTitle };

/**
 * «تحدّي الأسئلة».
 *
 * `quizGame` مقفولة افتراضيًا على أي ستاك غير أيمن، فالصفحة بترجع 404 هناك —
 * نفس الحارس اللي على الـAPI (`@RequireFeature('quizGame')`)، عشان اللينك
 * مايوصلش لشاشة فاضية بتقول «مقدرناش نجيب الجولة».
 *
 * صفحة الألعاب (الكورسات وعدد أسئلة كل مستوى) بتتجاب من السيرفر فالشاشة
 * بتفتح جاهزة؛ الجولة نفسها بتتجاب من المتصفح بعد الاختيار.
 */
export default async function GamePage() {
  if (!(await featureEnabled('quizGame'))) notFound();
  const hub = await apiGetAuthed('/api/me/game/hub', GameHubSchema);

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-4">
        <p className="eyebrow">{c.eyebrow}</p>
        <h1 className="mt-1 text-[length:var(--fs-title-2)] font-bold text-fg">{c.hubTitle}</h1>
      </header>
      <GamesHub hub={hub} />
    </main>
  );
}
