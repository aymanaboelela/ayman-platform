import { CheckCircle2, Lightbulb } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { SafeHtml } from '@/components/content/safe-html';

const c = copy.game;

/**
 * بعد الإجابة الغلط (وبعد كل سؤال في «تدريب»): الإجابة الصح، وشرح المدرّس
 * لو كتبه. الاتنين جايين من رد `POST /api/me/game/answer` — يعني بعد ما
 * الإجابة اتحسبت، مش مع السؤال.
 *
 * `explanationHtml` اتنضّف في السيرفر قبل ما يتبعت (`GameService.answer`)،
 * وخيارات السؤال من بنك الأسئلة اللي بينضّف وهو بيكتب — نفس الثقة اللي
 * `SafeHtml` محتاجها في باقي اللعبة.
 */
export function AnswerExplain({
  rightHtml,
  explanationHtml,
}: {
  rightHtml: readonly string[];
  explanationHtml: string | null;
}) {
  if (rightHtml.length === 0 && !explanationHtml) return null;
  return (
    <div className="gm-explain" role="note">
      {rightHtml.length > 0 ? (
        <div className="gm-explain__row" data-kind="right">
          <p className="gm-explain__label">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {c.rightAnswer}
          </p>
          {rightHtml.map((html, i) => (
            <SafeHtml key={i} html={html} className="gm-explain__body" />
          ))}
        </div>
      ) : null}
      {explanationHtml ? (
        <div className="gm-explain__row" data-kind="why">
          <p className="gm-explain__label">
            <Lightbulb className="size-4" aria-hidden="true" />
            {c.explanation}
          </p>
          <SafeHtml html={explanationHtml} className="gm-explain__body" />
        </div>
      ) : null}
    </div>
  );
}
