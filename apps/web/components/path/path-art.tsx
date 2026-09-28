/**
 * رسمة هيرو «مساري»: طريق متعرّج طالع من تحت لفوق بين تلّين، عليه علامات
 * محطات، وفي آخره علم. الطريق بيتملى بلون لحد نسبة الطالب، فالرسمة نفسها
 * بتقول وصل فين.
 *
 * مرسومة هنا مش صورة: بتتلوّن من التوكنز، مفيهاش حاجة تخص مدرّس بعينه، ووزنها
 * أقل من صورة PNG صغيرة. الحركة CSS (`path.css`) وبتقف مع
 * `prefers-reduced-motion`.
 */
export function PathArt({ percent }: { percent: number }) {
  // `pathLength=100` بيخلّي طول الطريق ١٠٠ مهما كان شكله، فالنسبة بتتحط زي ما هي.
  const done = Math.min(100, Math.max(0, percent));
  return (
    <svg className="pth-art" viewBox="0 0 260 200" aria-hidden="true" focusable="false">
      {/* سما وشمس */}
      <circle className="pth-art__sun" cx="206" cy="42" r="18" />
      <g className="pth-art__cloud">
        <ellipse cx="62" cy="38" rx="22" ry="9" />
        <ellipse cx="78" cy="32" rx="14" ry="9" />
      </g>
      <g className="pth-art__cloud pth-art__cloud--2">
        <ellipse cx="150" cy="22" rx="16" ry="6" />
        <ellipse cx="160" cy="18" rx="10" ry="6" />
      </g>

      {/* تلّين، مقصوصين بمستطيل مدوّر عشان المنظر مايخلصش بحرف حاد تحت */}
      <defs>
        <clipPath id="pth-scene">
          <rect x="0" y="0" width="260" height="200" rx="22" />
        </clipPath>
      </defs>
      <g clipPath="url(#pth-scene)">
        <path className="pth-art__hill pth-art__hill--back" d="M0 150 C 60 100, 120 110, 170 130 S 240 120, 260 110 V200 H0 Z" />
        <path className="pth-art__hill" d="M0 175 C 50 140, 110 150, 150 165 S 230 150, 260 150 V200 H0 Z" />
      </g>

      {/* الطريق: الأرضية، وبعدين الجزء اللي اتقطع بلونه، وبعدين الخط المتقطّع في النص */}
      <path
        className="pth-art__road"
        d="M24 196 C 60 170, 40 150, 90 140 S 160 138, 150 110 S 170 70, 214 64"
        pathLength={100}
      />
      <path
        className="pth-art__road-done"
        d="M24 196 C 60 170, 40 150, 90 140 S 160 138, 150 110 S 170 70, 214 64"
        pathLength={100}
        strokeDasharray={`${done} 100`}
      />
      <path
        className="pth-art__lane"
        d="M24 196 C 60 170, 40 150, 90 140 S 160 138, 150 110 S 170 70, 214 64"
        pathLength={100}
      />

      {/* محطات على الطريق */}
      <circle className="pth-art__stop" cx="56" cy="166" r="5" />
      <circle className="pth-art__stop" cx="118" cy="139" r="5" />
      <circle className="pth-art__stop" cx="154" cy="104" r="5" />

      {/* العلم في الآخر */}
      <g className="pth-art__flag">
        <rect x="212" y="30" width="3" height="36" rx="1.5" fill="#fff" />
        <path d="M215 31 h24 l-6 8 l6 8 h-24 z" />
      </g>

      {/* لمعات */}
      <g fill="#fff">
        <path className="pth-art__spark" d="M110 60l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        <path className="pth-art__spark pth-art__spark--2" d="M236 92l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" />
        <circle className="pth-art__spark pth-art__spark--3" cx="30" cy="92" r="2.5" />
      </g>
    </svg>
  );
}
