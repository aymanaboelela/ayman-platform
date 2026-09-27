import type { RankLevelKey } from '@ayman/contracts/rank';

/**
 * رسمة الهيرو: كاس، وحواليه غصنين غار ونجوم بتلمع، وتحته قاعدة مكتوب عليها
 * المستوى بلونه.
 *
 * مرسومة هنا مش صورة متحمّلة، لتلات أسباب: بتتلوّن بلون مستوى الطالب
 * (`--lvl`) من غير نسخة لكل مستوى، مفيهاش أي حاجة تخص مدرّس بعينه فبتشتغل على
 * أي ستاك، ووزنها أقل من صورة PNG واحدة صغيرة.
 *
 * الحركة كلها CSS (`rank.css`)، وكلها جوّه `prefers-reduced-motion:
 * no-preference`.
 */
export function RankArt({ level }: { level: RankLevelKey }) {
  return (
    <svg
      className="rk-art"
      data-level={level}
      viewBox="0 0 240 240"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="rk-cup" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--rk-gold-hi)" />
          <stop offset="0.55" stopColor="var(--rk-gold)" />
          <stop offset="1" stopColor="var(--rk-gold-lo)" />
        </linearGradient>
        <linearGradient id="rk-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="rk-cup-clip">
          <path d="M78 52h84v30c0 30-18 52-42 52s-42-22-42-52z" />
        </clipPath>
      </defs>

      {/* هالة ورا الكاس */}
      <circle className="rk-art__halo" cx="120" cy="104" r="86" />
      <circle className="rk-art__halo rk-art__halo--inner" cx="120" cy="104" r="62" />

      {/* غصنين الغار */}
      <g className="rk-art__laurel">
        {[0, 1, 2, 3, 4].map((i) => (
          <ellipse
            key={`l${i}`}
            cx={62 - i * 3}
            cy={150 - i * 20}
            rx="7"
            ry="15"
            transform={`rotate(${-35 + i * 12} ${62 - i * 3} ${150 - i * 20})`}
          />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <ellipse
            key={`r${i}`}
            cx={178 + i * 3}
            cy={150 - i * 20}
            rx="7"
            ry="15"
            transform={`rotate(${35 - i * 12} ${178 + i * 3} ${150 - i * 20})`}
          />
        ))}
      </g>

      {/* الكاس */}
      <g className="rk-art__cup">
        <path
          d="M78 60H58c0 26 12 40 30 42M162 60h20c0 26-12 40-30 42"
          fill="none"
          stroke="var(--rk-gold)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path d="M78 52h84v30c0 30-18 52-42 52s-42-22-42-52z" fill="url(#rk-cup)" />
        <g clipPath="url(#rk-cup-clip)">
          <rect className="rk-art__shine" x="40" y="40" width="34" height="110" fill="url(#rk-shine)" />
        </g>
        <path d="M108 132h24l4 22h-32z" fill="var(--rk-gold-lo)" />
        <rect x="90" y="152" width="60" height="12" rx="4" fill="var(--rk-gold)" />
        {/* النجمة على الكاس */}
        <path
          d="M120 70l6.2 12.6 13.9 2-10 9.8 2.4 13.8L120 101.7l-12.4 6.5 2.4-13.8-10-9.8 13.9-2z"
          fill="#fff"
          fillOpacity="0.92"
        />
      </g>

      {/* القاعدة بلون المستوى */}
      <rect className="rk-art__base" x="70" y="166" width="100" height="30" rx="8" />
      <rect x="82" y="176" width="76" height="10" rx="5" fill="#fff" fillOpacity="0.35" />

      {/* نجوم بتلمع */}
      <g className="rk-art__sparks" fill="#fff">
        <path className="rk-art__spark" d="M40 56l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
        <path className="rk-art__spark rk-art__spark--2" d="M200 40l2.4 6 6 2.4-6 2.4-2.4 6-2.4-6-6-2.4 6-2.4z" />
        <path className="rk-art__spark rk-art__spark--3" d="M206 132l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        <path className="rk-art__spark rk-art__spark--4" d="M30 150l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        <circle className="rk-art__spark rk-art__spark--5" cx="170" cy="26" r="3" />
        <circle className="rk-art__spark rk-art__spark--2" cx="64" cy="30" r="2.5" />
      </g>
    </svg>
  );
}

/**
 * جوهرة المستوى — شكل واحد، واللون من `data-level`. بتتكرر في طريق المستويات
 * وجنب اسم المستوى، فلازم تبقى خفيفة.
 */
export function LevelGem({ level, className }: { level: RankLevelKey; className?: string }) {
  return (
    <svg
      className={['rk-gem', className].filter(Boolean).join(' ')}
      data-level={level}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path className="rk-gem__body" d="M24 4l16 12-16 28L8 16z" />
      <path className="rk-gem__facet" d="M8 16h32L24 44z" />
      <path className="rk-gem__top" d="M16 16l8-12 8 12z" />
      <path d="M17 9l-3 5" stroke="#fff" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
