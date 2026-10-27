import { Injectable } from '@nestjs/common';
import type {
  SocialConnection,
  SocialConnectionTest,
  SocialConnectionWrite,
} from '@ayman/contracts/social/posts';
import { AuditService } from '../../audit/audit.service';
import { currentActor } from '../../audit/audit-context';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaGraphClient, GraphApiError } from './meta-graph.client';
import { openToken, sealToken, tokenHint, tokenKey } from './token-cipher';

export const SOCIAL_SETTINGS_ID = 1;
export const SOCIAL_RESOURCE = 'social_settings';

/** What the publisher needs, with the token OPENED. Never leaves the API. */
export interface PublishTarget {
  pageId: string | null;
  instagramUserId: string | null;
  token: string;
}

interface SettingsRow {
  pageId: string | null;
  instagramUserId: string | null;
  tokenCiphertext: string | null;
  tokenHint: string | null;
  hashtags: string;
  lastScanAt: Date | null;
  updatedAt: Date;
}

/**
 * The Facebook Page / Instagram account the studio posts to, and the one
 * place the Page token is ever decrypted.
 *
 * Every read the browser can reach goes through `read()`, which returns
 * `tokenSet` and the last four characters and nothing else — there is no
 * route, DTO or audit row that carries the token, by construction: the
 * plaintext exists only inside `target()`, on its way to the Graph client.
 */
@Injectable()
export class SocialConnectionService {
  private keyCache: Buffer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly graph: MetaGraphClient,
  ) {}

  private key(): Buffer {
    this.keyCache ??= tokenKey(loadEnv(process.env).BETTER_AUTH_SECRET);
    return this.keyCache;
  }

  async row(): Promise<SettingsRow | null> {
    return this.prisma.socialSettings.findUnique({
      where: { id: SOCIAL_SETTINGS_ID },
      select: {
        pageId: true,
        instagramUserId: true,
        tokenCiphertext: true,
        tokenHint: true,
        hashtags: true,
        lastScanAt: true,
        updatedAt: true,
      },
    });
  }

  async read(): Promise<SocialConnection> {
    const row = await this.row();
    const usable = row?.tokenCiphertext ? openToken(row.tokenCiphertext, this.key()) !== null : false;
    return {
      pageId: row?.pageId ?? null,
      instagramUserId: row?.instagramUserId ?? null,
      // A token sealed under a rotated secret reads as «not set», so the
      // screen asks for it again instead of claiming a connection that fails.
      tokenSet: usable,
      tokenHint: usable ? (row?.tokenHint ?? null) : null,
      hashtags: row?.hashtags ?? '',
      updatedAt: row ? row.updatedAt.toISOString() : null,
    };
  }

  /** `null` when publishing cannot go through the API on this stack. */
  async target(): Promise<PublishTarget | null> {
    const row = await this.row();
    if (!row?.tokenCiphertext || (!row.pageId && !row.instagramUserId)) return null;
    const token = openToken(row.tokenCiphertext, this.key());
    return token ? { pageId: row.pageId, instagramUserId: row.instagramUserId, token } : null;
  }

  async channels(): Promise<{ facebook: boolean; instagram: boolean }> {
    const target = await this.target();
    return { facebook: Boolean(target?.pageId), instagram: Boolean(target?.instagramUserId) };
  }

  async write(input: SocialConnectionWrite): Promise<SocialConnection> {
    const actor = currentActor().actorUserId;
    const token =
      input.accessToken === undefined
        ? undefined
        : input.accessToken === null
          ? { tokenCiphertext: null, tokenHint: null }
          : { tokenCiphertext: sealToken(input.accessToken, this.key()), tokenHint: tokenHint(input.accessToken) };

    const data = {
      pageId: input.pageId,
      instagramUserId: input.instagramUserId,
      hashtags: input.hashtags,
      updatedBy: actor,
      ...(token ?? {}),
    };
    await this.prisma.socialSettings.upsert({
      where: { id: SOCIAL_SETTINGS_ID },
      create: { id: SOCIAL_SETTINGS_ID, ...data },
      update: data,
    });

    await this.audit.record({
      action: 'social:connection',
      resourceType: SOCIAL_RESOURCE,
      resourceId: String(SOCIAL_SETTINGS_ID),
      outcome: 'success',
      // What changed, never the value of the token.
      metadata: {
        pageId: input.pageId,
        instagramUserId: input.instagramUserId,
        token: input.accessToken === undefined ? 'kept' : input.accessToken === null ? 'cleared' : 'replaced',
      },
    });

    return this.read();
  }

  async test(): Promise<SocialConnectionTest> {
    const row = await this.row();
    const target = await this.target();
    if (!target || !row?.pageId) {
      return { ok: false, pageName: null, instagramUserId: null, error: 'not connected' };
    }
    try {
      const info = await this.graph.pageInfo(row.pageId, target.token);
      return { ok: true, pageName: info.name, instagramUserId: info.instagramUserId, error: null };
    } catch (error) {
      return {
        ok: false,
        pageName: null,
        instagramUserId: null,
        error: error instanceof GraphApiError ? error.message : 'could not reach Meta',
      };
    }
  }

  async markScanned(at: Date): Promise<void> {
    await this.prisma.socialSettings.upsert({
      where: { id: SOCIAL_SETTINGS_ID },
      create: { id: SOCIAL_SETTINGS_ID, lastScanAt: at },
      update: { lastScanAt: at },
    });
  }
}
