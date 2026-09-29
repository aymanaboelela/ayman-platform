/* نفس اللي صفحة الطالب بتستورده: كوبي الأدمن من مسارها، وكوبي الطالب من
   الجدول المشترك — التسميتين «دخل في» و«آخر نشاط» موجودين في «أجهزتي» بالحرف،
   وتكرارهم هنا كان هيخلّي الشاشتين تختلفوا على اسم نفس الحاجة. */
import { copy } from '@ayman/contracts/copy/admin';
import { copy as shared } from '@ayman/contracts/copy';
import { effectiveMaxDevices } from '@ayman/contracts/device-limit';
import { formatCopy } from '@ayman/contracts/format';
import type { SessionDevice } from '@ayman/contracts/sessions';
import { devicesLabel } from './device-count';
import { DeviceLimitControl, DeviceSignOut, SignOutAllDevices } from './device-controls';

/**
 * الأجهزة اللي حساب الطالب مفتوح عليه دلوقتي — وإيه اللي المدرّس يقدر يعمله فيها.
 *
 * ## ليه دي لوحة في صفحة الأدمن أصلًا
 *
 * الطالب اللي واصل للحد بيشوف «الحساب مفتوح على كل الأجهزة المسموح بيها» —
 * وبعدين بيكلّم المدرّس. الشاشة دي هي اللي بتجاوبه.
 *
 * ## ليه بقى فيها زراير
 *
 * كانت قراءة بس، والقفل للطالب من «أجهزتي». بس الطالب اللي الحد رفضه على
 * صفحة الدخول مش واصل لـ«أجهزتي» — فالمدرّس كان بيشوف المشكلة ومش بيقدر
 * يحلّها. «سجّل خروج» هنا هو `revokeOwn` نفسه على الحساب ده (الملكية لسه في
 * الـWHERE)، والحد بقى لكل حساب (`users.max_devices`).
 *
 * الجملة فوق بتقول الحد الحقيقي — `effectiveMaxDevices`، نفس الدالة اللي
 * البوابة بتعدّ بيها — مش «جهازين» مكتوبة في الكوبي.
 *
 * `canManage` = `student:write`. اللي معاه `student:read` بس بيشوف الليستة
 * والحد، ومابيشوفش زراير هترجعله 403.
 *
 * `isCurrent` مابيتعرضش: هي بتوصف متصفّح القارئ، والقارئ هنا مش صاحب الحساب.
 */
export function DevicesSection({
  userId,
  devices,
  maxDevices,
  canManage,
}: {
  userId: string;
  devices: readonly SessionDevice[];
  maxDevices: number | null;
  canManage: boolean;
}) {
  const c = copy.admin.settings;
  const labels = shared.settings.devices;

  return (
    <section className="rounded-lg border border-line p-5">
      <h2 className="text-[length:var(--fs-title-4)] font-semibold">{c.studentDevices}</h2>
      <p className="mt-1 text-[length:var(--fs-text-sm)] font-medium text-fg">
        {formatCopy(c.studentDevicesLimit, { devices: devicesLabel(effectiveMaxDevices(maxDevices)) })}
      </p>
      {canManage ? (
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.studentDevicesHint}</p>
      ) : null}

      {devices.length === 0 ? (
        <p className="mt-4 text-fg-muted">{c.studentDevicesEmpty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {devices.map((device) => (
            <li
              key={device.id}
              className="flex flex-col items-start gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0">
                <p className="font-medium">{device.deviceName}</p>
                <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                  <div className="flex gap-1">
                    <dt>{labels.loggedInAt}</dt>
                    {/* ⚠️ `dir="ltr"` مع `isolate`: التاريخ أرقام لاتينية جوّه
                        جملة عربية، ومن غيرها ترتيبه بيتقلب. */}
                    <dd dir="ltr" className="unicode-isolate">
                      {new Date(device.loggedInAt).toLocaleDateString('ar-EG')}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>{labels.lastSeenAt}</dt>
                    <dd dir="ltr" className="unicode-isolate">
                      {new Date(device.lastSeenAt).toLocaleDateString('ar-EG')}
                    </dd>
                  </div>
                </dl>
              </div>
              {canManage ? (
                <DeviceSignOut userId={userId} deviceId={device.id} deviceName={device.deviceName} />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
          {/* «كل الأجهزة» مع جهاز واحد هو نفس زرار الصف — مش زرار تاني. */}
          {devices.length > 1 ? <SignOutAllDevices userId={userId} /> : null}
          <DeviceLimitControl userId={userId} maxDevices={maxDevices} />
        </div>
      ) : null}
    </section>
  );
}
