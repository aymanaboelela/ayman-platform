import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { estimateMinutes, nextSend, rolled, type RunState } from '@ayman/contracts/marketing/pacing';
import {
  WA_CONTACTS_MAX_ATTEMPTS,
  WA_CONTACTS_PACING,
  runLimitReached,
  waitUntil,
  type WaContactsPauseCode,
  type WaContactsStart,
  type WaContactsState,
  type WaContactsStatus,
} from '@ayman/contracts/marketing/wa-contacts';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { waContactsCopy } from '@ayman/contracts/copy/wa-contacts';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceOfflineError, WhatsappDeviceService, WhatsappRestrictedError } from './whatsapp-device.service';
import type { WhatsappContactSync } from '../../generated/prisma/client';

/**
 * «احفظهم في واتساب» — every student as a WhatsApp-only contact on the linked
 * number, one at a time, so the instructor's Status reaches them.
 *
 * ## The shape
 *
 *   · `start()` queues every student with a valid number into
 *     `whatsapp_contact_saves` (one row per E.164 number — dedupe and memory
 *     in one key) and marks the singleton run `running`.
 *   · `step()` is one tick of `WaContactsRunner`: at most ONE contact, then
 *     the next one is scheduled by the same pacing functions a campaign uses
 *     (`WA_CONTACTS_PACING`).
 *   · ANY error stops the run (`paused` + a code). Nothing is skipped past a
 *     refusal: the first thing WhatsApp objects to is a signal about the
 *     number, and the next four thousand rows must not be spent ignoring it.
 *
 * ## Idempotent in both directions
 *
 * A row that is `saved` is never written again, so «ابدأ» twice, a redeploy
 * mid-run, or a second admin pressing it only ever adds the students who
 * signed up since. The pacing counters live on the run row and survive runs,
 * so starting again cannot buy the number a fresh daily cap.
 */

/** The run row's id. A CHECK in the migration pins it. */
const SYNC_ID = 1;

/** What WhatsApp shows when a student's name is somehow empty. */
const NAME_MAX = 60;

@Injectable()
export class WaContactsService {
  private readonly logger = new Logger(WaContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly device: WhatsappDeviceService,
  ) {}

  private async sync(): Promise<WhatsappContactSync> {
    return this.prisma.whatsappContactSync.upsert({ where: { id: SYNC_ID }, create: { id: SYNC_ID }, update: {} });
  }

  /**
   * Queue every student who is not queued yet, and run.
   *
   * Refused while the device is not connected: a run that starts only to
   * pause on its first tick would read «شغّال» for ten seconds and then
   * contradict itself.
   */
  async start(input: WaContactsStart, actorId: string, now = new Date()): Promise<{ queued: number }> {
    const device = await this.device.status();
    if (device.state !== 'connected') throw new ConflictException(waContactsCopy.deviceOffline);

    const queued = await this.enqueue();
    // A failed row gets one fresh chance per run: the reason it failed may
    // have been the device, not the number. `attempts` still caps it.
    await this.prisma.whatsappContactSave.updateMany({
      where: { status: 'failed', attempts: { lt: WA_CONTACTS_MAX_ATTEMPTS } },
      data: { status: 'pending' },
    });

    await this.sync();
    await this.prisma.whatsappContactSync.update({
      where: { id: SYNC_ID },
      data: {
        state: 'running',
        pauseCode: null,
        lastError: null,
        runLimit: input.limit,
        savedThisRun: 0,
        startedAt: now,
        startedBy: actorId,
        nextAt: now,
      },
    });
    return { queued };
  }

  async pause(): Promise<void> {
    await this.sync();
    await this.prisma.whatsappContactSync.updateMany({
      where: { id: SYNC_ID, state: 'running' },
      data: { state: 'paused', pauseCode: 'manual' },
    });
  }

  /**
   * Every student with a usable number, as one row per number.
   *
   * Students only (not the instructor or his assistants), not banned. The
   * number goes through the same parser the campaign audience uses, so a
   * malformed one is never sent to WhatsApp to be looked up.
   */
  private async enqueue(): Promise<number> {
    const students = await this.prisma.studentProfile.findMany({
      where: { phone: { not: '' }, user: { role: 'student', bannedAt: null } },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
      select: { userId: true, fullName: true, phone: true },
    });

    const rows = new Map<string, { phone: string; userId: string; name: string }>();
    for (const student of students) {
      const phone = normalizeEgyptianPhone(student.phone ?? '');
      const name = student.fullName.replace(/\s+/gu, ' ').trim().slice(0, NAME_MAX);
      if (!phone || !name || rows.has(phone)) continue;
      rows.set(phone, { phone, userId: student.userId, name });
    }
    if (rows.size === 0) return 0;

    const { count } = await this.prisma.whatsappContactSave.createMany({
      data: [...rows.values()],
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * One tick: at most one contact.
   *
   * `jitter` is `Math.random()` in production, a fixed value in specs — the
   * same reason `nextSend` takes it.
   */
  async step(now = new Date(), jitter = Math.random()): Promise<void> {
    const sync = await this.prisma.whatsappContactSync.findUnique({ where: { id: SYNC_ID } });
    if (!sync || sync.state !== 'running') return;
    if (sync.nextAt && sync.nextAt > now) return;

    if (runLimitReached(sync.runLimit, sync.savedThisRun)) {
      await this.stop('limit');
      return;
    }

    const state = rolled(stateOf(sync), now);
    const wait = waitUntil(now, WA_CONTACTS_PACING, state);
    if (wait) {
      await this.prisma.whatsappContactSync.update({
        where: { id: SYNC_ID },
        data: { ...toColumns(state), nextAt: wait },
      });
      return;
    }

    const row = await this.prisma.whatsappContactSave.findFirst({
      where: { status: 'pending' },
      orderBy: [{ createdAt: 'asc' }, { phone: 'asc' }],
    });
    if (!row) {
      await this.prisma.whatsappContactSync.update({
        where: { id: SYNC_ID },
        data: { state: 'done', pauseCode: null, nextAt: null },
      });
      return;
    }

    // A student deleted after being queued is not saved. Their number may by
    // now belong to someone who never signed up.
    if (row.userId) {
      const profile = await this.prisma.studentProfile.findUnique({
        where: { userId: row.userId },
        select: { userId: true },
      });
      if (!profile) {
        await this.prisma.whatsappContactSave.update({ where: { phone: row.phone }, data: { status: 'skipped' } });
        return;
      }
    }

    let result: Awaited<ReturnType<WhatsappDeviceService['saveContact']>>;
    try {
      result = await this.device.saveContact(row.phone, row.name);
    } catch (error) {
      await this.fail(row.phone, row.attempts, error);
      return;
    }

    if (!result.onWhatsApp) {
      // Not a save, but still a lookup on the wire: it waits the short gap,
      // and it does not count against the day's cap.
      await this.prisma.whatsappContactSave.update({
        where: { phone: row.phone },
        data: { status: 'not_on_whatsapp', attempts: { increment: 1 } },
      });
      await this.prisma.whatsappContactSync.update({
        where: { id: SYNC_ID },
        data: { ...toColumns(state), nextAt: new Date(now.getTime() + WA_CONTACTS_PACING.minDelaySeconds * 1000) },
      });
      return;
    }

    await this.prisma.whatsappContactSave.update({
      where: { phone: row.phone },
      data: { status: 'saved', savedAt: now, lid: result.lid, lastError: null, attempts: { increment: 1 } },
    });
    const next = nextSend(now, WA_CONTACTS_PACING, state, jitter);
    const savedThisRun = sync.savedThisRun + 1;
    const limitHit = runLimitReached(sync.runLimit, savedThisRun);
    await this.prisma.whatsappContactSync.update({
      where: { id: SYNC_ID },
      data: {
        ...toColumns(next.state),
        savedThisRun,
        lastSavedAt: now,
        nextAt: limitHit ? null : next.at,
        // The trial stops the moment it has done its share, so the screen
        // says «خلص التجربة» now, not one tick later.
        ...(limitHit ? { state: 'paused' satisfies WaContactsState, pauseCode: 'limit' satisfies WaContactsPauseCode } : {}),
      },
    });
  }

  /** Records the failure on the row and stops the run. Always stops. */
  private async fail(phone: string, attempts: number, error: unknown): Promise<void> {
    const code: WaContactsPauseCode =
      error instanceof WhatsappRestrictedError ? 'restricted' : error instanceof DeviceOfflineError ? 'device' : 'error';
    const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);

    // The device being away is not the number's fault: the row keeps its
    // attempts, so a long outage cannot fail every contact it touched.
    const counts = code === 'error';
    const spent = counts ? attempts + 1 : attempts;
    await this.prisma.whatsappContactSave.update({
      where: { phone },
      data: {
        lastError: message,
        attempts: spent,
        status: counts && spent >= WA_CONTACTS_MAX_ATTEMPTS ? 'failed' : 'pending',
      },
    });
    this.logger.warn({ code, message }, 'wa contacts run stopped');
    await this.stop(code, message);
  }

  private async stop(code: WaContactsPauseCode, lastError: string | null = null): Promise<void> {
    await this.prisma.whatsappContactSync.update({
      where: { id: SYNC_ID },
      data: { state: 'paused', pauseCode: code, lastError, nextAt: null },
    });
  }

  async status(now = new Date()): Promise<WaContactsStatus> {
    const [sync, grouped, studentsWithPhone, device] = await Promise.all([
      this.sync(),
      this.prisma.whatsappContactSave.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.studentProfile.count({ where: { phone: { not: '' }, user: { role: 'student', bannedAt: null } } }),
      this.device.status(),
    ]);
    const count = (status: string) => grouped.find((row) => row.status === status)?._count._all ?? 0;
    const pending = count('pending');
    const state = rolled(stateOf(sync), now);

    return {
      state: sync.state as WaContactsState,
      pauseCode: (sync.pauseCode as WaContactsPauseCode | null) ?? null,
      lastError: sync.lastError,
      runLimit: sync.runLimit,
      savedThisRun: sync.savedThisRun,
      savedToday: state.sentToday,
      dailyCap: WA_CONTACTS_PACING.dailyCap,
      nextAt: sync.nextAt?.toISOString() ?? null,
      startedAt: sync.startedAt?.toISOString() ?? null,
      lastSavedAt: sync.lastSavedAt?.toISOString() ?? null,
      deviceConnected: device.state === 'connected',
      studentsWithPhone,
      counts: {
        pending,
        saved: count('saved'),
        notOnWhatsapp: count('not_on_whatsapp'),
        failed: count('failed'),
        skipped: count('skipped'),
      },
      estimateMinutes: Math.round(estimateMinutes(pending, WA_CONTACTS_PACING)),
    };
  }
}

function stateOf(sync: WhatsappContactSync): RunState {
  return { sentInBatch: sync.sentInBatch, sentToday: sync.savedToday, dayKey: sync.dayKey };
}

function toColumns(state: RunState) {
  return { sentInBatch: state.sentInBatch, savedToday: state.sentToday, dayKey: state.dayKey };
}
