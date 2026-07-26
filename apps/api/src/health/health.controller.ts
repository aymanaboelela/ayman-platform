import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Public: load balancers / uptime checks have no session. */
  @Public()
  @Get()
  async check(): Promise<{ status: 'ok' | 'degraded'; service: string; database: 'up' | 'down' }> {
    const dbUp = await this.prisma.isHealthy();
    return {
      status: dbUp ? 'ok' : 'degraded',
      service: 'ayman-api',
      database: dbUp ? 'up' : 'down',
    };
  }
}
