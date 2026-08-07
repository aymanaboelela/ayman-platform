import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Captured once, when the module is first imported — so it marks when THIS
 * process booted, and a redeploy necessarily moves it.
 *
 * It exists for the deploy job in .github/workflows/ci.yml. That job used to
 * verify a deploy purely by watching the served asset hashes change, which
 * cannot work for a push that alters no client-side output: an API-only or
 * CI-only change rebuilds and restarts everything while the browser payload
 * stays byte-identical. This is the signal that says "the container you are
 * talking to is not the one you were talking to before" regardless of what
 * changed. Second precision is deliberate — it is a restart marker, not a
 * clock, and nothing should read it as one.
 */
const STARTED_AT = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Public: load balancers / uptime checks have no session. */
  @Public()
  @Get()
  async check(): Promise<{
    status: 'ok' | 'degraded';
    service: string;
    database: 'up' | 'down';
    startedAt: string;
  }> {
    const dbUp = await this.prisma.isHealthy();
    return {
      status: dbUp ? 'ok' : 'degraded',
      service: 'ayman-api',
      database: dbUp ? 'up' : 'down',
      startedAt: STARTED_AT,
    };
  }
}
