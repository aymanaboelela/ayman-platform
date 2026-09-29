'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ArenaLobby as Lobby } from '@ayman/contracts/arena';
import { ArenaLobby } from './arena-lobby';
import { ArenaMatch, ArenaResult, ArenaSearch, ArenaVersus } from './arena-screens';
import { cueFor } from './arena-state';
import { useArenaLive, type ArenaErrorCode } from './use-arena-live';
import { useArenaSound } from './use-arena-sound';

/**
 * «ساحة التحدي» — الصفحة كلها بعد اللوبي اللي السيرفر رسمه.
 *
 * الشاشة بتتختار من الحالة اللي السيرفر بعتها (`screenOf`): لوبي، بندوّر،
 * VS، سؤال، نتيجة. الصوت بيتلعب على كل fx جديد — بعد أول دوسة بس، لأن
 * المتصفح مابيسمحش قبلها.
 */
export function ArenaApp({ lobby }: { lobby: Lobby }) {
  const router = useRouter();
  const sound = useArenaSound();
  const arena = useArenaLive({ view: lobby.view, at: lobby.at });
  const { state, screen } = arena;
  const firstPlayable = lobby.courses.find((course) => course.playable)?.id ?? null;
  const [courseId, setCourseId] = useState<string | null>(
    lobby.view.phase === 'queued' ? lobby.view.courseId : firstPlayable,
  );

  const { play } = sound;
  const fxKey = state.fx?.key;
  useEffect(() => {
    if (!state.fx) return;
    const cue = cueFor(state.fx.fx, state.view.phase === 'match' ? state.view.match : null);
    if (cue) play(cue);
    // `fxKey` بس: نفس الـfx مرتين = صوتين، وتغيير الحالة من غير fx جديد = سكوت.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxKey]);

  const course = lobby.courses.find((entry) => entry.id === (state.want ?? courseId));
  const match = state.view.phase === 'match' ? state.view.match : null;

  const start = (id: string | null) => {
    if (!id) return;
    sound.unlock();
    setCourseId(id);
    arena.start(id);
  };

  const backToLobby = () => {
    arena.reset();
    // النقط والترتيب اتغيّروا — اللوبي يتقري من جديد.
    router.refresh();
  };

  return (
    <div className="ca" data-screen={screen}>
      {screen === 'lobby' ? (
        <ArenaLobby
          lobby={lobby}
          courseId={courseId}
          onCourse={setCourseId}
          onStart={() => start(courseId)}
          error={(state.error as ArenaErrorCode | null) ?? null}
          sound={sound}
        />
      ) : null}
      {screen === 'search' ? (
        <ArenaSearch
          state={state}
          me={{ name: lobby.me.name, image: lobby.me.image }}
          courseTitle={state.view.phase === 'queued' ? state.view.courseTitle : (course?.title ?? '')}
          cohortLabel={state.view.phase === 'queued' ? state.view.cohortLabel : (lobby.cohort?.label ?? '')}
          onCancel={() => void arena.cancel()}
          onKeepWaiting={arena.keepWaiting}
          sound={sound}
        />
      ) : null}
      {screen === 'versus' && match ? <ArenaVersus match={match} offset={state.offset} sound={sound} /> : null}
      {screen === 'question' && match ? (
        <ArenaMatch
          state={state}
          match={match}
          onAnswer={(optionId) => {
            if (match.question) void arena.answer(match.id, match.question.index, optionId);
          }}
          onLeave={() => void arena.leave(match.id)}
          sound={sound}
        />
      ) : null}
      {screen === 'result' && match ? (
        <ArenaResult match={match} onAgain={() => start(courseId ?? firstPlayable)} onLobby={backToLobby} sound={sound} />
      ) : null}
    </div>
  );
}
