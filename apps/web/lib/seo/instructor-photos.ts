import { copy } from '@ayman/contracts';
import { aymanOnly } from '@/lib/tenant';

/**
 * Real photographs of him, for `/about`, the `Person.image` list and the image
 * sitemap.
 *
 * A bare-name image search returned a former MP who shares the name, because
 * this site published one photograph of him and showed it nowhere. Google
 * Images ranks a picture by the page around it: the file name, the `alt`, the
 * caption and the structured data all saying the same name is what ties these
 * faces to «أيمن أبو العلا» rather than to the other one.
 *
 * Cut from his originals on 2026-10-26 with sharp: 1600px long side, mozjpeg
 * q80, and EVERY metadata block dropped — two of the originals (and the
 * `ayman.jpg` that had been live since August) carried GPS coordinates, one of
 * them his home.
 *
 * The first entry is the portrait: the `/about` headshot and
 * `primaryImageOfPage`. His stack only — an empty list anywhere else.
 */
export interface InstructorPhoto {
  path: string;
  width: number;
  height: number;
  caption: string;
}

const p = copy.landing.aboutPhotos;

const PHOTOS: readonly InstructorPhoto[] | undefined = aymanOnly([
  { path: '/team/ayman-abo-el-ela-podcast.jpg', width: 1200, height: 1600, caption: p.podcast },
  { path: '/team/ayman-abo-el-ela-speaker-mnu.jpg', width: 1600, height: 1066, caption: p.speakerMnu },
  { path: '/team/ayman-abo-el-ela-microsoft-egypt.jpg', width: 1200, height: 1600, caption: p.microsoftEgypt },
  { path: '/team/ayman-abo-el-ela-stage-mnu.jpg', width: 1600, height: 900, caption: p.stageMnu },
  { path: '/team/ayman-abo-el-ela-microsoft-podium.jpg', width: 1200, height: 1600, caption: p.microsoftPodium },
  { path: '/team/ayman-abo-el-ela-cairo-ict.jpg', width: 1200, height: 1600, caption: p.cairoIct },
  { path: '/team/ayman-abo-el-ela-workshop.jpg', width: 1013, height: 1600, caption: p.workshop },
  { path: '/team/ayman-abo-el-ela-desk.jpg', width: 1200, height: 1600, caption: p.desk },
]);

export const INSTRUCTOR_PHOTOS: readonly InstructorPhoto[] = PHOTOS ?? [];
