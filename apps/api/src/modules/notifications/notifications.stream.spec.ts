import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type Redis from 'ioredis';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { setUserPermissionOverrides } from '../../auth/permissions';
import { NotificationsController } from './notifications.controller';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import type { NotificationsService } from './notifications.service';
import type { PushService } from './push.service';

/**
 * `GET /api/me/notifications/stream` — WHO hears the payments desk.
 *
 * The route itself is `profile:read`, which every student holds, so the queue
 * frames are the one thing on it that needs a second answer: a student's
 * stream must never carry «N payments are waiting», and an assistant whose
 * `payment:read` is locked must stop hearing it without a reload.
 *
 * Real `NotificationsRealtimeService`, real permission table, a Redis that is
 * only pub/sub in memory — no database, runs anywhere.
 */

class FakeRedis extends EventEmitter {
  constructor(private readonly channels: Map<string, Set<FakeRedis>>) {
    super();
  }
  duplicate(): FakeRedis {
    return new FakeRedis(this.channels);
  }
  async subscribe(channel: string): Promise<void> {
    const set = this.channels.get(channel) ?? new Set<FakeRedis>();
    set.add(this);
    this.channels.set(channel, set);
  }
  async unsubscribe(channel: string): Promise<void> {
    this.channels.get(channel)?.delete(this);
    if (this.channels.get(channel)?.size === 0) this.channels.delete(channel);
  }
  async publish(channel: string, raw: string): Promise<number> {
    const subscribers = [...(this.channels.get(channel) ?? [])];
    for (const subscriber of subscribers) subscriber.emit('message', channel, raw);
    return subscribers.length;
  }
  async quit(): Promise<void> {}
}

/** Just enough of an Express response to hold an SSE stream open. */
class FakeResponse extends EventEmitter {
  readonly frames: string[] = [];
  headers: Record<string, string> = {};
  writeHead(_status: number, headers: Record<string, string>) {
    this.headers = headers;
    return this;
  }
  flushHeaders() {}
  write(chunk: string) {
    this.frames.push(chunk);
    return true;
  }
  end() {}
  /** The `data:` frames, parsed — the retry line and anything else dropped. */
  events(): unknown[] {
    return this.frames
      .filter((frame) => frame.startsWith('data: '))
      .map((frame) => JSON.parse(frame.slice('data: '.length)));
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function userOf(id: string, role: string): AuthenticatedUser {
  return {
    id,
    role,
    email: `${id}@t.test`,
    name: id,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('NotificationsController.stream — the payments desk', () => {
  let channels: Map<string, Set<FakeRedis>>;
  let realtime: NotificationsRealtimeService;
  let controller: NotificationsController;
  const open: FakeResponse[] = [];

  function connect(user: AuthenticatedUser): FakeResponse {
    const response = new FakeResponse();
    open.push(response);
    controller.stream(user, response as unknown as Response);
    return response;
  }

  beforeEach(() => {
    channels = new Map();
    realtime = new NotificationsRealtimeService(new FakeRedis(channels) as unknown as Redis);
    controller = new NotificationsController(
      {} as NotificationsService,
      realtime,
      {} as PushService,
    );
  });

  afterEach(async () => {
    // Closing is what clears each stream's heartbeat interval.
    for (const response of open.splice(0)) response.emit('close');
    setUserPermissionOverrides(new Map());
    await realtime.onApplicationShutdown();
  });

  it('carries a queue frame to an admin stream, count and all', async () => {
    const admin = connect(userOf('desk-admin', 'admin'));
    await settle();

    await realtime.publishQueue('payments', 3);

    expect(admin.events()).toEqual([{ type: 'queue', queue: 'payments', waiting: 3 }]);
    // The headers that keep Traefik and Cloudflare from buffering a stream
    // into a request that never answers — the desk rides on them too.
    expect(admin.headers['X-Accel-Buffering']).toBe('no');
    expect(admin.headers['Cache-Control']).toContain('no-transform');
  });

  it('never carries it to a student — and never even subscribes the channel for one', async () => {
    const student = connect(userOf('desk-student', 'student'));
    await settle();

    expect(channels.has('notif-queue:payments')).toBe(false);
    await realtime.publishQueue('payments', 3);
    expect(student.events()).toEqual([]);
  });

  it('asks again per frame: an assistant locked out of payments mid-shift stops hearing it', async () => {
    const assistant = connect(userOf('desk-assistant', 'owner'));
    await settle();

    await realtime.publishQueue('payments', 1);
    expect(assistant.events()).toHaveLength(1);

    setUserPermissionOverrides(
      new Map([['desk-assistant', { allow: new Set<string>(), deny: new Set(['payment:read']) }]]),
    );
    await realtime.publishQueue('payments', 2);

    expect(assistant.events()).toEqual([{ type: 'queue', queue: 'payments', waiting: 1 }]);
  });

  it('lets go of the queue channel when the last admin tab closes', async () => {
    const admin = connect(userOf('desk-admin-2', 'admin'));
    await settle();
    expect(channels.has('notif-queue:payments')).toBe(true);

    admin.emit('close');
    open.splice(open.indexOf(admin), 1);
    await settle();

    expect(channels.has('notif-queue:payments')).toBe(false);
  });
});
