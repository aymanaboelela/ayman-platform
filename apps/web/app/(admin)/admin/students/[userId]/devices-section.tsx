/* نفس اللي صفحة الطالب بتستورده: كوبي الأدمن من مسارها، وكوبي الطالب من
   الجدول المشترك — التسميتين «دخل في» و«آخر نشاط» موجودين في «أجهزتي» بالحرف،
   وتكرارهم هنا كان هيخلّي الشاشتين تختلفوا على اسم نفس الحاجة. */
import { copy } from '@ayman/contracts/copy/admin';
import { copy as shared } from '@ayman/contracts/copy';
import type { SessionDevice } from '@ayman/contracts/sessions';

/**
 * الأجهزة اللي حساب الطالب مفتوح عليه دلوقتي.
 *
 * ## ليه دي لوحة في صفحة الأدمن أصلًا
 *
 * الحد جهازين (`loginDeviceLimit`)، والطالب اللي واصل للحد بيشوف «الحساب مفتوح
 * على جهازين خلاص» — وبعدين بيكلّم المدرّس. من غير الشاشة دي، المدرّس مش عنده
 * أي طريقة يشوف بيها اللي الطالب بيوصفه.
 *
 * ## ⚠️ قراءة بس، ومفيش زرار قفل
 *
 * القفل لسه للطالب من «أجهزتي». `revokeOwn` في الـAPI بيركّب الملكية في الـ
 * WHERE نفسه (`id = $1 AND user_id = $2`) عشان مايبقاش فيه طريق يقفل جهاز حد
 * تاني — وزرار هنا كان هيطلب فتح الطريق ده. المدرّس بيشوف المشكلة ويقول
 * للطالب يقفل، وده كل اللي كان مطلوب.
 *
 * `isCurrent` مابيتعرضش: هي بتوصف متصفّح القارئ، والقارئ هنا مش صاحب الحساب.
 */
export function DevicesSection({ devices }: { devices: readonly SessionDevice[] }) {
  const c = copy.admin.settings;
  const labels = shared.settings.devices;

  return (
    <section className="rounded-lg border border-line p-5">
      <h2 className="text-[length:var(--fs-title-4)] font-semibold">{c.studentDevices}</h2>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.studentDevicesHint}</p>

      {devices.length === 0 ? (
        <p className="mt-4 text-fg-muted">{c.studentDevicesEmpty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {devices.map((device) => (
            <li key={device.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
