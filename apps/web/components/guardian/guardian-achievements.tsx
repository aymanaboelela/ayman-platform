import { Award, BookMarked, Crown, Medal } from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { guardianCopy as c } from '@ayman/contracts/copy/guardian';
import { formatCopy } from '@ayman/contracts/format';
import type { GuardianView } from '@ayman/contracts/guardian-view';
import { formatDate } from '@/lib/guardian-view';
import { IsolatedFigures } from '@/components/results/isolated-figures';
import { SectionHead } from './section-head';

/**
 * «الإنجازات» — rank in the cohort, the honor board, certificates, and the
 * lectures most worth going back over. Each block is drawn only where its
 * feature exists on this stack (the API sends `null` otherwise), so a teacher
 * without certificates shows no empty certificate shelf.
 *
 * The rank names the student's own place and nobody else's — the API never
 * sends the podium the student's own `/rank` page draws.
 */
export function GuardianAchievements({ view }: { view: GuardianView }) {
  const { rank, honorBoard, certificates, weakTopics } = view;
  if (!rank && !honorBoard && !certificates && !weakTopics) return null;
  const certCount = certificates ? certificates.units.length + certificates.exams.length : 0;

  return (
    <section className="gd-section" data-tone="exams" aria-labelledby="gd-achievements">
      <SectionHead id="gd-achievements" title={c.achievements.title} />
      <div className="gd-achieve">
        {rank && rank.rank !== null ? (
          <article className="gd-badge" data-tone="rank">
            <span className="gd-badge__icon" aria-hidden="true">
              <Crown className="size-6" />
            </span>
            <span className="gd-badge__label">{formatCopy(c.achievements.rank, { cohort: rank.cohortLabel })}</span>
            <span className="gd-badge__value gd-num">{formatCopy(c.achievements.rankValue, { rank: rank.rank })}</span>
            <span className="gd-badge__note">
              {/* «أحسن من 80% من الدفعة» — the figure isolated, or the RTL line
                  carries the percent sign to the wrong side of it. */}
              <IsolatedFigures
                text={
                  rank.betterThanPercent !== null
                    ? formatCopy(c.achievements.betterThan, { percent: Math.round(rank.betterThanPercent) })
                    : formatCopy(c.achievements.points, { points: rank.points })
                }
              />
            </span>
          </article>
        ) : null}

        {honorBoard ? (
          <article className="gd-badge" data-tone="honor">
            <span className="gd-badge__icon" aria-hidden="true">
              <Medal className="size-6" />
            </span>
            <span className="gd-badge__label">{c.achievements.honor}</span>
            <span className="gd-badge__value gd-badge__value--text">{honorBoard.reason}</span>
            <span className="gd-badge__note">
              {honorBoard.courseLabel} · {arabicCount(honorBoard.total, c.achievements.honorTimes)}
            </span>
          </article>
        ) : null}

        {certificates ? (
          <article className="gd-badge gd-badge--wide" data-tone="cert">
            <span className="gd-badge__icon" aria-hidden="true">
              <Award className="size-6" />
            </span>
            <span className="gd-badge__label">{c.achievements.certificates}</span>
            {certCount === 0 ? (
              <span className="gd-badge__note">
                {formatCopy(c.achievements.certificatesNone, { percent: certificates.minPercent })}
              </span>
            ) : (
              <ul className="gd-certs">
                {certificates.exams.map((exam) => (
                  <li key={`e:${exam.id}`}>
                    <span>
                      <IsolatedFigures
                        text={formatCopy(c.achievements.examCertificate, { title: exam.title, percent: Math.round(exam.percent) })}
                      />
                    </span>
                    <span className="gd-certs__meta">
                      {exam.courseTitle} · {formatDate(exam.earnedAt)}
                    </span>
                  </li>
                ))}
                {certificates.units.map((unit) => (
                  <li key={`u:${unit.id}`}>
                    <span>{formatCopy(c.achievements.unitCertificate, { title: unit.title })}</span>
                    <span className="gd-certs__meta">
                      {unit.courseTitle} · {formatDate(unit.earnedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ) : null}

        {weakTopics ? (
          <article className="gd-badge gd-badge--wide" data-tone="weak">
            <span className="gd-badge__icon" aria-hidden="true">
              <BookMarked className="size-6" />
            </span>
            <span className="gd-badge__label">{c.achievements.weakTitle}</span>
            {weakTopics.length === 0 ? (
              <span className="gd-badge__note">{c.achievements.weakNone}</span>
            ) : (
              <>
                <span className="gd-badge__note">{c.achievements.weakLead}</span>
                <ul className="gd-weak">
                  {weakTopics.map((topic) => (
                    <li key={`${topic.courseTitle ?? ''}:${topic.title}`}>
                      <span className="gd-weak__title">{topic.title}</span>
                      {topic.courseTitle ? <span className="gd-weak__course">{topic.courseTitle}</span> : null}
                      <span className="gd-weak__count">{arabicCount(topic.mistakes, c.achievements.weakCount)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ) : null}
      </div>
    </section>
  );
}
