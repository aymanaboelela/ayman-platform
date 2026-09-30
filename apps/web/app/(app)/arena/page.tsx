import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Swords } from 'lucide-react';
import { ArenaLobbySchema, type ArenaLobby } from '@ayman/contracts/arena';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { ArenaApp } from '@/components/arena/arena-app';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { IS_AYMAN } from '@/lib/tenant';
import '@/components/rank/rank.css';
import '@/components/arena/arena.css';

const c = arenaCopy;

export const metadata: Metadata = { title: c.meta.title };

/**
 * «ساحة التحدي» — ماتش مباشر بين طالبين من نفس الدفعة ونفس الكورس.
 *
 * اللوبي بيترسم هنا (مين أنا، دفعتي، كورساتي، نقطي، الأوائل)، والباقي كله
 * في المتصفح: الستريم والطابور والماتش (`ArenaApp`).
 *
 * الفلاج مقفول = الـAPI بيرد ٤٠٤. عند أيمن البند موجود في القايمة، فبدل
 * صفحة «مش موجود» بتظهر «الساحة مقفولة دلوقتي»؛ على أي ستاك تاني مفيش بند
 * أصلًا، فـ`notFound()` زي أي فيتشر مش موجودة.
 */
export default async function ArenaPage() {
  let lobby: ArenaLobby;
  try {
    lobby = await apiGetAuthed('/api/me/arena', ArenaLobbySchema);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      if (!IS_AYMAN) notFound();
      return <ArenaClosed />;
    }
    throw error;
  }

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8">
      <ArenaApp lobby={lobby} />
    </main>
  );
}

function ArenaClosed() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8">
      <section className="ca-card ca-blocked">
        <Swords className="ca-blocked__icon" aria-hidden="true" />
        <h1 className="ca-card__title">{c.lobby.closedTitle}</h1>
        <p className="ca-card__sub">{c.lobby.closedBody}</p>
      </section>
    </main>
  );
}
