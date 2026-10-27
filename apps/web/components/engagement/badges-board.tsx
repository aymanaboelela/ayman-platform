import type { ComponentType } from 'react';
import {
  BookOpenCheck,
  CircleCheckBig,
  ClipboardPen,
  Flame,
  GraduationCap,
  Lock,
  Medal,
  NotebookPen,
  Sparkles,
  StickyNote,
  Swords,
  Target,
  type LucideProps,
} from 'lucide-react';
import type { BadgeFamilyKey, BadgeFamilyState, BadgesPayload, BadgeTier } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { formatCopy } from '@ayman/contracts/format';
import { CountUp } from '@/components/rank/count-up';

const c = engagementCopy.badges;

const ICON: Record<BadgeFamilyKey, ComponentType<LucideProps>> = {
  lessons: BookOpenCheck,
  quizzes: CircleCheckBig,
  fullMarks: Target,
  streak: Flame,
  daily: Sparkles,
  homework: ClipboardPen,
  mistakes: NotebookPen,
  notes: StickyNote,
  arena: Swords,
  courses: GraduationCap,
};

/** Formatted on the server only, so no device zone can mismatch hydration. */
const stamp = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' });

function highest(state: BadgeFamilyState): BadgeTier | null {
  const earned = state.tiers.filter((rung) => rung.earnedAt);
  return earned.at(-1)?.tier ?? null;
}

/**
 * «أوسمتي» — the ladders as medals: each family a disc in the colour of its
 * highest rung, three pips under it, and the meter to the next rung. A family
 * with nothing yet is drawn whole and greyed, so the page says what there is
 * to get before anything is got.
 */
export function BadgesBoard({ badges }: { badges: BadgesPayload }) {
  return (
    <>
      <section className="eg-hero" data-hue="rose">
        <div className="eg-hero__shapes" aria-hidden="true">
          <span className="eg-shape eg-shape--ring" />
          <span className="eg-shape eg-shape--blob" />
        </div>
        <span className="eg-hero__pill">
          <Medal className="size-3.5" aria-hidden="true" />
          {c.hero.pill}
        </span>
        <p className="eg-hero__total">
          <span className="eg-hero__num">
            <CountUp to={badges.earned} />
          </span>
          <span className="eg-hero__label">
            {formatCopy(c.hero.of, { total: badges.total })} {c.hero.label}
          </span>
        </p>
        {badges.recent.length > 0 ? (
          <div className="eg-hero__chips" aria-label={c.hero.recent}>
            {badges.recent.map((entry) => {
              const Icon = ICON[entry.key];
              return (
                <span key={`${entry.key}:${entry.tier}`} className="eg-hero__chip" data-tier={entry.tier}>
                  <Icon className="size-3.5" aria-hidden="true" />
                  {c.family[entry.key].name} · {c.tier[entry.tier]}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="eg-hero__sub">{c.hero.none}</p>
        )}
      </section>

      <ul className="eg-badges">
        {badges.families.map((family) => (
          <BadgeTile key={family.key} family={family} />
        ))}
      </ul>
    </>
  );
}

function BadgeTile({ family }: { family: BadgeFamilyState }) {
  const Icon = ICON[family.key];
  const top = highest(family);
  const next = family.tiers.find((rung) => !rung.earnedAt) ?? null;
  const previousTarget = next ? (family.tiers[family.tiers.indexOf(next) - 1]?.target ?? 0) : 0;
  const fill = next
    ? Math.min(100, Math.max(0, ((family.value - previousTarget) / (next.target - previousTarget)) * 100))
    : 100;
  const label = c.family[family.key];

  return (
    <li className="eg-badge" data-tier={top ?? 'none'}>
      {family.fresh ? <span className="eg-badge__new">{c.newBadge}</span> : null}
      <span className="eg-badge__disc" aria-hidden="true">
        <Icon className="size-8" />
        {top === null ? (
          <span className="eg-badge__lock">
            <Lock className="size-3" />
          </span>
        ) : null}
      </span>
      <h3 className="eg-badge__name">{label.name}</h3>
      <p className="eg-badge__unit">
        <span className="eg-badge__value">{family.value}</span> {label.unit}
      </p>
      <ol className="eg-badge__pips" aria-label={label.name}>
        {family.tiers.map((rung) => (
          <li
            key={rung.tier}
            className="eg-badge__pip"
            data-tier={rung.tier}
            data-earned={rung.earnedAt !== null}
            title={
              rung.earnedAt
                ? `${c.tier[rung.tier]} — ${formatCopy(c.earnedOn, { date: stamp.format(new Date(rung.earnedAt)) })}`
                : `${c.tier[rung.tier]} — ${rung.target}`
            }
          >
            <span className="sr-only">
              {c.tier[rung.tier]}: {rung.earnedAt ? formatCopy(c.earnedOn, { date: stamp.format(new Date(rung.earnedAt)) }) : rung.target}
            </span>
          </li>
        ))}
      </ol>
      {next ? (
        <div className="eg-badge__meter">
          <span className="eg-badge__track">
            <span className="eg-badge__fill" style={{ inlineSize: `${fill}%` }} />
          </span>
          <span className="eg-badge__next">
            {formatCopy(c.next, { tier: c.tier[next.tier], target: next.target })}
          </span>
        </div>
      ) : (
        <p className="eg-badge__done">{c.complete}</p>
      )}
    </li>
  );
}
