import { Inject, Injectable } from '@nestjs/common';
import { loadEnv } from '../../config/env';

/**
 * Turns a stored object key into a URL. A port rather than a function because
 * the destination is going to change: today it is a static base URL, tomorrow
 * it is a signed, expiring URL from whatever bucket the media library lands
 * on (Plan 6 Task 13 rebinds this onto `MediaStorage`). Everything upstream
 * depends on this interface, not on the mechanism.
 *
 * Storage keys — never full URLs — are what the database holds (§6.7), so the
 * origin is a deployment decision and moving buckets is an env change.
 */
export interface MediaUrlResolver {
  resolve(storageKey: string): string;
}

export const MEDIA_URL_RESOLVER = Symbol('MEDIA_URL_RESOLVER');

@Injectable()
export class EnvMediaUrlResolver implements MediaUrlResolver {
  private readonly base: string;

  constructor() {
    // Spec §7 P6: media is served from a DIFFERENT origin than the app,
    // because a same-origin HTML upload is same-origin XSS regardless of CSP.
    this.base = loadEnv(process.env).MEDIA_BASE_URL.replace(/\/+$/, '');
  }

  resolve(storageKey: string): string {
    return `${this.base}/${storageKey.replace(/^\/+/, '')}`;
  }
}

/** Convenience decorator so consumers do not repeat the token. */
export const InjectMediaUrl = (): ParameterDecorator => Inject(MEDIA_URL_RESOLVER);
