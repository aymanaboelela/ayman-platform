import { FeatureFlagListSchema } from '@ayman/contracts/admin/flags';
import { copy } from '@ayman/contracts';
import { Card, CardBody } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { FlagSwitch } from './flag-switch';

export const metadata = { title: copy.admin.flags.title };

/** Uncached — an editor must see their own last write, never a stale switch state. */
export default async function FlagsPage() {
  const flags = await adminGet('/api/admin/flags', FeatureFlagListSchema);

  return (
    <>
      <h1 className="mb-4 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.flags.title}
      </h1>
      <p className="mb-24 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.flags.lead}</p>

      <Card>
        <CardBody className="divide-y divide-line-subtle">
          {flags.map((flag) => (
            <FlagSwitch key={flag.key} flag={flag} />
          ))}
        </CardBody>
      </Card>
    </>
  );
}
