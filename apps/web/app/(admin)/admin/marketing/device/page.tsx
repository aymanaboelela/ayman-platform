import { WhatsappDeviceSchema } from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { MarketingTabs } from '../tabs';
import { DevicePanel } from './device-panel';
import { TestSend } from './test-send';

const c = copy.marketing;

export const metadata = { title: c.deviceTitle };

export default async function MarketingDevicePage() {
  const device = await adminGet('/api/admin/marketing/device', WhatsappDeviceSchema);

  return (
    <>
      <MarketingTabs />

      <div className="mb-6">
        <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.deviceTitle}</h1>
        <p className="max-w-[var(--w-prose)] text-fg-muted">{c.deviceLead}</p>
      </div>

      <DevicePanel initial={device} />

      {/*
        Under the pairing, and only once there is a device to test — the
        screen reads top to bottom as «هل الجهاز مربوط» then «طيب هو بيوصّل
        فعلاً», which are two different questions and were for a long time
        assumed to be one.
      */}
      {device.state === 'connected' ? (
        <div className="mt-6">
          <TestSend />
        </div>
      ) : null}
    </>
  );
}
