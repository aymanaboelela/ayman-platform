import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { ArenaFrame } from '@ayman/contracts/arena';

type Listener = (frame: ArenaFrame) => void;

/**
 * الفريمات لكل طالب، أيًّا كان الستريم بتاعه مفتوح فين.
 *
 * نفس شكل `NotificationsRealtimeService` بالظبط وبنفس الأسباب: قناة Redis لكل
 * طالب، وكونكشن subscriber لوحده (كونكشن في وضع subscribe مايقدرش يشغّل
 * أوامر عادية، والـ`REDIS` المشترك بتاع الثروتلر). بس ده بيبعت `ArenaFrame`
 * وعلى قناة ليها بادئة لوحدها (`arena:ch:`) — nanoid عمره ما فيه `:`، فمفيش
 * قناة ممكن تتلخبط مع `notif:<id>`.
 */
export interface ArenaRealtime {
  publish(userId: string, frame: ArenaFrame): Promise<void>;
  /** لازم الدالة اللي بترجع تتنده لما الستريم يتقفل. */
  subscribe(userId: string, listener: Listener): () => void;
  close(): Promise<void>;
}

const channelFor = (userId: string) => `arena:ch:${userId}`;

export class RedisArenaRealtime implements ArenaRealtime {
  private readonly logger = new Logger('ArenaRealtime');
  private subscriber: Redis | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(private readonly redis: Redis) {}

  async publish(userId: string, frame: ArenaFrame): Promise<void> {
    await this.redis.publish(channelFor(userId), JSON.stringify(frame));
  }

  subscribe(userId: string, listener: Listener): () => void {
    const channel = channelFor(userId);
    const set = this.listeners.get(channel);
    if (set) set.add(listener);
    else {
      this.listeners.set(channel, new Set([listener]));
      void this.connection()
        .subscribe(channel)
        .catch((error: Error) => this.logger.warn(`subscribe ${channel}: ${error.message}`));
    }
    return () => {
      const current = this.listeners.get(channel);
      if (!current) return;
      current.delete(listener);
      if (current.size > 0) return;
      this.listeners.delete(channel);
      void this.connection()
        .unsubscribe(channel)
        .catch((error: Error) => this.logger.warn(`unsubscribe ${channel}: ${error.message}`));
    };
  }

  async close(): Promise<void> {
    this.listeners.clear();
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => undefined);
      this.subscriber = null;
    }
  }

  private connection(): Redis {
    if (this.subscriber) return this.subscriber;
    const subscriber = this.redis.duplicate({
      connectionName: 'ayman-api-arena',
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
    });
    subscriber.on('message', (channel: string, raw: string) => this.deliver(channel, raw));
    subscriber.on('error', (error: Error) => this.logger.warn(`arena subscriber: ${error.message}`));
    this.subscriber = subscriber;
    return subscriber;
  }

  private deliver(channel: string, raw: string): void {
    const set = this.listeners.get(channel);
    if (!set) return;
    let frame: ArenaFrame;
    try {
      frame = JSON.parse(raw) as ArenaFrame;
    } catch {
      return;
    }
    for (const listener of [...set]) {
      try {
        listener(frame);
      } catch (error) {
        this.logger.warn(`an arena listener threw: ${(error as Error).message}`);
      }
    }
  }
}

/** في نفس البروسيس — للسبكس. */
export class MemoryArenaRealtime implements ArenaRealtime {
  private readonly listeners = new Map<string, Set<Listener>>();
  /** كل فريم اتبعت لكل طالب، بالترتيب — السبكس بتقرا منه. */
  readonly sent = new Map<string, ArenaFrame[]>();

  async publish(userId: string, frame: ArenaFrame): Promise<void> {
    const log = this.sent.get(userId) ?? [];
    log.push(frame);
    this.sent.set(userId, log);
    for (const listener of [...(this.listeners.get(userId) ?? [])]) listener(frame);
  }

  subscribe(userId: string, listener: Listener): () => void {
    const set = this.listeners.get(userId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(userId, set);
    return () => set.delete(listener);
  }

  async close(): Promise<void> {
    this.listeners.clear();
  }
}
