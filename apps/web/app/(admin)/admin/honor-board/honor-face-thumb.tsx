import Image from 'next/image';
import { mediaUrl } from '@ayman/ui/branding';
import { HonorAvatar } from '@/components/site/honor-avatar';

/**
 * نفس وش الكارت العام، بحجم صف في ليستة.
 *
 * بيقرا **نفس** المفتاح اللي اللوحة بتقراه بالترتيب ده: صورة التكريم، وبعدين
 * صورة لوحة الشرف اللي في البروفايل. الشاشة بتعرض اللي هينزل على الموقع،
 * مش وصف ليه — لو الاتنين فاضيين بيظهر الأڤاتار المرسوم، وده بالظبط اللي الزائر
 * هيشوفه.
 *
 * ⚠️ عمره ما بيقرا `User.image`. الأڤاتار بتاع الطالب نفسه ومش متكلّم عنه
 * للنشر — الحتة دي مكتوبة بالكامل على `honor-face.tsx` و على العمود نفسه.
 */
export function HonorFaceThumb({ name, photoKey }: { name: string; photoKey: string | null }) {
  if (!photoKey) {
    return (
      <span className="block size-11 shrink-0" aria-hidden="true">
        <HonorAvatar name={name} />
      </span>
    );
  }

  return (
    <Image
      src={mediaUrl(photoKey)}
      alt=""
      width={88}
      height={88}
      sizes="2.75rem"
      className="size-11 shrink-0 rounded-full object-cover"
    />
  );
}
