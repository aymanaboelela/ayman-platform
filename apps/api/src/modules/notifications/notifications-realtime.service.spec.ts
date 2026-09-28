import { EventEmitter } from 'node:events';
import type Redis from 'ioredis';
import type { NotificationEvent } from '@ayman/contracts/notifications';
import { NotificationsRealtimeService } from './notifications-realtime.service';

/**
 * A Redis with just the pub/sub the service uses, shared by every connection
 * `duplicate()` hands out — so a PUBLISH on the shared client reaches the
 * subscriber connection exactly as it would across two API instances.
 *
 * No database and no real Redis: this spec is about which channel a frame
 * lands on and who hears it, and it runs anywhere.
 */
class FakeRedisBus {
  readonly channels = new Map<string, Set<FakeRedis>>();
  failPublish = false;
}

class FakeRedis extends EventEmitter {
  constructor(private readonly bus: FakeRedisBus) {
    super();
  }

  duplicate(): FakeRedis {
    return new FakeRedis(this.bus);
  }

  async subscribe(channel: string): Promise<void> {
    const set = this.bus.channels.get(channel) ?? new Set<FakeRedis>();
    set.add(this);
    this.bus.channels.set(channel, set);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.bus.channels.get(channel)?.delete(this);
    if (this.bus.channels.get(channel)?.size === 0) this.bus.channels.delete(channel);
  }

  async publish(channel: string, raw: string): Promise<number> {
    if (this.bus.failPublish) throw new Error('connection is closed');
    const subscribers = [...(this.bus.channels.get(channel) ?? [])];
    for (const subscriber of subscribers) subscriber.emit('message', channel, raw);
    return subscribers.length;
  }

  async quit(): Promise<void> {}
}

/** `subscribe` issues its Redis SUBSCRIBE without awaiting it — let it land. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('NotificationsRealtimeService', () => {
  let bus: FakeRedisBus;
  let service: NotificationsRealtimeService;

  beforeEach(() => {
    bus = new FakeRedisBus();
    service = new NotificationsRealtimeService(new FakeRedis(bus) as unknown as Redis);
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
  });

  it('hands a queue frame to every stream on that queue, with the count', async () => {
    const first: NotificationEvent[] = [];
    const second: NotificationEvent[] = [];
    service.subscribeQueue('payments', (event) => first.push(event));
    service.subscribeQueue('payments', (event) => second.push(event));
    await settle();

    await service.publishQueue('payments', 4);

    expect(first).toEqual([{ type: 'queue', queue: 'payments', waiting: 4 }]);
    expect(second).toEqual(first);
  });

  it('keeps the queue and a person apart — neither channel hears the other', async () => {
    const personal: NotificationEvent[] = [];
    const desk: NotificationEvent[] = [];
    service.subscribe('user-1', (event) => personal.push(event));
    service.subscribeQueue('payments', (event) => desk.push(event));
    await settle();

    await service.publishQueue('payments', 1);
    await service.publish('user-1', { type: 'ping' });

    expect(personal).toEqual([{ type: 'ping' }]);
    expect(desk).toEqual([{ type: 'queue', queue: 'payments', waiting: 1 }]);
  });

  it('subscribes the queue channel once however many tabs listen, and leaves it with the last', async () => {
    const offA = service.subscribeQueue('payments', () => undefined);
    const offB = service.subscribeQueue('payments', () => undefined);
    await settle();
    expect(bus.channels.get('notif-queue:payments')?.size).toBe(1);

    offA();
    await settle();
    expect(bus.channels.has('notif-queue:payments')).toBe(true);

    offB();
    await settle();
    expect(bus.channels.has('notif-queue:payments')).toBe(false);
  });

  it('still feeds the next tab when one unsubscribes in the middle of a delivery', async () => {
    const heard: string[] = [];
    // A response that closed: its listener unregisters itself on the frame.
    const off = service.subscribeQueue('payments', () => {
      heard.push('closing');
      off();
    });
    service.subscribeQueue('payments', () => heard.push('open'));
    await settle();

    await service.publishQueue('payments', 2);

    expect(heard).toEqual(['closing', 'open']);
  });

  it('never throws when Redis refuses the publish — the payment already committed', async () => {
    bus.failPublish = true;
    await expect(service.publishQueue('payments', 3)).resolves.toBeUndefined();
  });

  it('is a quiet no-op with no Redis at all (the cut-down fixtures)', async () => {
    const bare = new NotificationsRealtimeService();
    const heard: NotificationEvent[] = [];
    const off = bare.subscribeQueue('payments', (event) => heard.push(event));
    await expect(bare.publishQueue('payments', 1)).resolves.toBeUndefined();
    off();
    expect(heard).toEqual([]);
  });
});
