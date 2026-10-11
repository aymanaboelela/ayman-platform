import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { freshFirst } from '@ayman/contracts/quiz/challenges';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import { PrismaService } from '../../prisma/prisma.service';
import { GameService, type ArenaPoolItem } from '../quiz/game.service';
import { exposuresOf } from '../quiz/question-exposure';
import type { EngineQuestion } from './arena-engine';
import { pickQuestions } from './arena-matchmaking';
import type { ArenaQuestionsPort } from './arena.ports';

/**
 * أسئلة الماتش: من بنك الألعاب بتاع الاتنين في الكورس ده (`GameService
 * .arenaPool`)، اللي في البنكين الأول. نفس الأسئلة، بنفس الترتيب، ونفس ترتيب
 * الاختيارات للاتنين — الماتش بيتبني مرة واحدة ويتحفظ في Redis.
 *
 * ⚠️ `correct` بيتحسب هنا من `fraction` ومابيطلعش من السيرفر غير في
 * `reveal`، بعد ما السؤال يتقفل. والـHTML بيتنضّف تاني قبل ما يتبعت —
 * البنك بينضّفه وهو بيتكتب، ودي شبكة تانية على صفحة بتعرضه من غير سيرفر
 * كومبوننت في النص.
 */
@Injectable()
export class ArenaQuestionsService implements ArenaQuestionsPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
  ) {}

  async build(
    courseId: string,
    userIds: [string, string],
    count: number,
    topicIds: readonly string[] = [],
  ): Promise<EngineQuestion[]> {
    const [a, b] = await Promise.all(
      userIds.map((id) => (topicIds.length > 0 ? this.game.arenaTopicPool(id, courseId, topicIds) : this.game.arenaPool(id, courseId))),
    );
    // «ماتكرّرش»: اللي الاتنين ماشافوهوش الأول، وبعدين الأقدم عند الاتنين.
    const seen = await exposuresOf(this.prisma, userIds);
    const random = () => randomInt(1_000_000) / 1_000_000;
    const picked = pickQuestions<ArenaPoolItem>(a ?? [], b ?? [], count, random, (items) => freshFirst(items, seen, random));
    if (picked.length === 0) return [];

    const versions = await this.prisma.questionVersion.findMany({
      where: { id: { in: picked.map((item) => item.versionId) } },
      select: {
        id: true,
        type: true,
        stemHtml: true,
        options: { orderBy: { position: 'asc' }, select: { id: true, bodyHtml: true, fraction: true } },
      },
    });
    const byId = new Map(versions.map((version) => [version.id, version]));

    return picked.flatMap((item): EngineQuestion[] => {
      const version = byId.get(item.versionId);
      if (!version || version.options.length < 2) return [];
      if (version.type !== 'mcq_single' && version.type !== 'true_false') return [];
      const best = Math.max(0, ...version.options.map((option) => Number(option.fraction)));
      if (best <= 0) return [];
      const options = version.type === 'true_false' ? version.options : shuffle(version.options);
      return [
        {
          id: version.id,
          type: version.type,
          stemHtml: sanitizeRichText(version.stemHtml),
          options: options.map((option) => ({ id: option.id, bodyHtml: sanitizeRichText(option.bodyHtml) })),
          correct: version.options.filter((option) => Number(option.fraction) === best).map((option) => option.id),
        },
      ];
    });
  }
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
