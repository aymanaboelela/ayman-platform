import Image from 'next/image';
import { mediaUrl } from '@ayman/ui/branding';
import { copy } from '@ayman/contracts/copy';
import { getBranding } from '@/lib/settings';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { tenantName } from '@/lib/tenant';
import { NeonCommand, NeonHead, NeonMeta, NeonWindow, type MetaRow } from './neon-chrome';
import { META, MARKERS, neonCopy } from './neon-copy';
import { runtime } from './neon-format';

/**
 * The `instructor` block — `// instructor`, rendered as `whoami`.
 *
 * ## What it may contain, and what it may never contain
 *
 * `<InstructorProfile>` on the classic page is a portrait of Ayman, a tier
 * badge, and figures from his CV. Every one of those is HIS, and this preset
 * exists for somebody else's platform, so none of them is reachable from this
 * file: `lib/brand-assets.ts` — the registry holding his photograph, his
 * dragon and his monogram — is not imported, `copy.landing` is not imported,
 * and the only name printed here comes through `tenantName()`.
 *
 * What is left is the same QUESTION answered from the tenant's own data:
 *
 *   · the mark they uploaded (`logoDarkAssetId`, then `logoLightAssetId`),
 *   · the name their stack is deployed under,
 *   · what they have actually published — courses, lectures, total runtime.
 *
 * That last part is the one thing here a new instructor cannot fake and does
 * not have to write: it is counted from the catalogue, so it is true the day
 * it is read and it stays true without anybody maintaining it.
 *
 * ## Day one, with nothing published
 *
 * «0 كورس · 0 محاضرة» under a portrait is the worst sentence this section
 * could say, and it is also not information. So the counts are replaced by one
 * line saying the content is being built — the same fact, stated as a stage
 * rather than as a score — and the command to the catalogue is dropped,
 * because it would open onto nothing.
 *
 * With no logo uploaded either, the mark falls back to the drawn `</>`
 * monogram the hero uses. Same reasoning, stated there: a bordered empty box
 * is not a designed empty state.
 */
export async function NeonInstructor({ level }: { level: 1 | 2 }) {
  const [branding, { courses }] = await Promise.all([getBranding(), getCatalogOrEmpty()]);

  const logoKey = branding.logoDarkKey ?? branding.logoLightKey;
  const name = tenantName(copy.site.name);

  const lessons = courses.reduce((total, course) => total + course.lessonCount, 0);
  const seconds = courses.reduce((total, course) => total + course.totalSeconds, 0);

  const rows: MetaRow[] = [
    { key: META.courses, value: String(courses.length) },
    { key: META.lessons, value: String(lessons) },
    { key: META.runtime, value: runtime(seconds) },
  ];

  return (
    <section className="neon-section" id="instructor">
      <div className="neon-shell">
        <NeonHead marker={MARKERS.instructor} title={neonCopy.instructorTitle} level={level} />

        <div className="neon-who">
          <NeonWindow file={neonCopy.instructorFile} lit>
            <div className="neon-who__body">
              <span className="neon-who__mark" data-drawn={logoKey ? undefined : 'true'}>
                {logoKey ? (
                  /* Fixed 88×88 with `object-fit: contain` in the stylesheet —
                     the intrinsic ratio of an uploaded logo is unknowable here
                     and the box has to be reserved before the bytes land. No
                     `priority`: this sits most of a screen below the fold and
                     the hero's own mark is the one on the LCP path. */
                  <Image src={mediaUrl(logoKey)} alt="" width={88} height={88} sizes="88px" />
                ) : (
                  <span aria-hidden="true">&lt;/&gt;</span>
                )}
              </span>

              <div className="neon-who__text">
                <p className="neon-who__name">{name}</p>

                {courses.length > 0 ? (
                  <>
                    <NeonMeta rows={rows} />
                    <div className="neon-who__cmd">
                      <NeonCommand href="/courses" variant="path">
                        {neonCopy.instructorCta}
                      </NeonCommand>
                    </div>
                  </>
                ) : (
                  <p className="neon-who__pending">{neonCopy.instructorEmpty}</p>
                )}
              </div>
            </div>
          </NeonWindow>
        </div>
      </div>
    </section>
  );
}
