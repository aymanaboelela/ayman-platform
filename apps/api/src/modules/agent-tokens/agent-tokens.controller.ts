import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  AgentTokenCreateSchema,
  type AgentMe,
  type AgentTokenCreated,
  type AgentTokenList,
  type AgentTokenRow,
} from '@ayman/contracts/admin/agent-tokens';
import type { ResolvedAgentToken } from '../../auth/agent-token.resolver';
import { AllowAgentToken, NoAgentToken } from '../../auth/decorators/agent-token.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { parseRequest } from '../../common/http/parse-request';
import { AgentTokensService } from './agent-tokens.service';

/**
 * `/api/admin/agent-tokens` — «ربط Claude».
 *
 * `admin:access`: every staff account may make keys for ITSELF, because a key
 * can never carry more than its creator holds (see the resolver). That is
 * delegation of what you already have, not a grant.
 *
 * `@NoAgentToken()`: a key may not manage keys. One that could mint another
 * would survive its own revocation.
 */
@Controller('admin/agent-tokens')
@RequireFeature('agentTokens')
@RequirePermission('admin:access')
@NoAgentToken()
export class AdminAgentTokensController {
  constructor(private readonly tokens: AgentTokensService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<AgentTokenList> {
    return this.tokens.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<AgentTokenCreated> {
    return this.tokens.create(user, parseRequest(AgentTokenCreateSchema, body, 'agent token'));
  }

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AgentTokenRow> {
    return this.tokens.revoke(user, id);
  }
}

/**
 * `GET /api/agent/me` — what the key in hand can do. The MCP server calls it
 * on start-up so the assistant knows its own limits before it tries anything.
 *
 * Key-only by construction: a browser session has no `agentToken` and gets
 * a 404, so this never becomes a second "who am I" for the web app.
 */
@Controller('agent')
@RequireFeature('agentTokens')
export class AgentMeController {
  @Get('me')
  @AllowAgentToken()
  me(@Req() request: { agentToken?: ResolvedAgentToken }): AgentMe {
    const token = request.agentToken;
    if (!token) throw new NotFoundException();
    return {
      token: { id: token.id, name: token.name, expiresAt: token.expiresAt.toISOString() },
      user: { id: token.user.id, name: token.user.name, role: token.user.role },
      permissions: [...token.permissions].sort(),
    };
  }
}
