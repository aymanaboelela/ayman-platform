import { Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaModule } from '../../prisma/prisma.module';
import { REDIS, RedisModule } from '../../redis/redis.module';
import { QuizModule } from '../quiz/quiz.module';
import { AdminArenaController } from './admin-arena.controller';
import { ArenaAccessService } from './arena-access.service';
import { ArenaGateService, ArenaOpenGuard } from './arena-gate.service';
import { RedisArenaKv } from './arena-kv';
import { ArenaQuestionsService } from './arena-questions.service';
import { RedisArenaRealtime } from './arena-realtime';
import { ArenaRecordsService } from './arena-records.service';
import { ArenaController } from './arena.controller';
import {
  ARENA_ACCESS,
  ARENA_CLOCK,
  ARENA_KV,
  ARENA_QUESTIONS,
  ARENA_REALTIME,
  ARENA_RECORDS,
} from './arena.ports';
import { ArenaService } from './arena.service';

/**
 * «ساحة التحدي». الماتش الشغّال في Redis (`ArenaService`)، والنتيجة والرصيد
 * في Postgres (`ArenaRecordsService`)، والأسئلة من بنك الألعاب (`QuizModule`
 * → `GameService`).
 */
@Module({
  imports: [PrismaModule, RedisModule, QuizModule],
  controllers: [ArenaController, AdminArenaController],
  providers: [
    ArenaGateService,
    ArenaOpenGuard,
    ArenaAccessService,
    ArenaQuestionsService,
    ArenaRecordsService,
    ArenaService,
    { provide: ARENA_KV, inject: [REDIS], useFactory: (redis: Redis) => new RedisArenaKv(redis) },
    { provide: ARENA_REALTIME, inject: [REDIS], useFactory: (redis: Redis) => new RedisArenaRealtime(redis) },
    { provide: ARENA_ACCESS, useExisting: ArenaAccessService },
    { provide: ARENA_QUESTIONS, useExisting: ArenaQuestionsService },
    { provide: ARENA_RECORDS, useExisting: ArenaRecordsService },
    { provide: ARENA_CLOCK, useValue: () => Date.now() },
  ],
})
export class ArenaModule {}
