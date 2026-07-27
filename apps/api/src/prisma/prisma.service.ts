import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Prisma 7 dropped connection URLs from schema.prisma — the client now
    // takes a driver adapter at construction time. This always connects as
    // ayman_runtime (DATABASE_URL): DML only, never DDL. Migrations use the
    // separate ayman_owner connection configured in prisma.config.ts.
    //
    // B1: an explicit pool ceiling, not `pg.Pool`'s implicit default of 10.
    // Every interactive transaction (`submit`, `closeOverdue`, appeal
    // resolution, ...) checks out ONE dedicated connection for its whole
    // duration — that used to be TWO per submit, because
    // `LessonProgressService.recordQuizResult` opened a second, nested
    // `$transaction` from inside the caller's already-open one. Ten
    // concurrent submits at one exam deadline wedged the pool solid: every
    // outer transaction timed out waiting for a connection its OWN nested
    // call was holding. `recordQuizResultTx` (see that module) fixes the
    // double check-out; `max` below and `transactionOptions` make the
    // resulting ceiling a deliberate, tunable number instead of a library
    // default nobody chose.
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.DATABASE_POOL_MAX ?? 20),
      }),
      transactionOptions: {
        maxWait: 5000,
        timeout: 10000,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap liveness probe for the health endpoint. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
