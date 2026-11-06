import { Module } from '@nestjs/common';
import { AdminAgentTokensController, AgentMeController } from './agent-tokens.controller';
import { AgentTokensService } from './agent-tokens.service';

/**
 * «ربط Claude» — the screen's API for agent keys, and the key's own
 * `GET /api/agent/me`. Verifying a key on every request is NOT here: that is
 * `AgentTokenResolver` in `AuthModule`, because `AuthGuard` needs it.
 */
@Module({
  controllers: [AdminAgentTokensController, AgentMeController],
  providers: [AgentTokensService],
})
export class AgentTokensModule {}
