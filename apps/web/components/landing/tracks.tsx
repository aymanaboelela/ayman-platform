import Link from 'next/link';
import { copy } from '@ayman/contracts';

const c = copy.landing;

interface Line {
  n: number;
  parts: { t: string; k?: 'kw' | 'str' | 'num' | 'com' | 'fn' }[];
}

interface Track {
  file: string;
  branch: string;
  status: string;
  lines: Line[];
  tag: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  accent: string;
}

const TRACKS: Track[] = [
  {
    file: 'essentials/core.js',
    branch: 'warm-up',
    status: 'تمهيد',
    accent: 'var(--cyan)',
    lines: [
      { n: 1, parts: [{ t: 'const', k: 'kw' }, { t: ' basics = [' }] },
      { n: 2, parts: [{ t: '  "متغيّر"', k: 'str' }, { t: ', ' }, { t: '"دالة"', k: 'str' }, { t: ',' }] },
      { n: 3, parts: [{ t: '  "شرط"', k: 'str' }, { t: '];' }] },
      { n: 4, parts: [{ t: 'startWith', k: 'fn' }, { t: '(basics);' }] },
    ],
    tag: c.trackEssentialsTag,
    title: c.trackEssentialsTitle,
    body: c.trackEssentialsBody,
    cta: c.trackEssentialsCta,
    href: '/courses',
  },
  {
    file: 'grade-01/basics.js',
    branch: 'main',
    status: 'جاهز',
    accent: 'var(--violet)',
    lines: [
      { n: 1, parts: [{ t: '// أول سطر كود ليك', k: 'com' }] },
      { n: 2, parts: [{ t: 'let', k: 'kw' }, { t: ' student = ' }, { t: '"أولى"', k: 'str' }, { t: ';' }] },
      { n: 3, parts: [{ t: 'if', k: 'kw' }, { t: ' (ready) {' }] },
      { n: 4, parts: [{ t: '  startLearning', k: 'fn' }, { t: '(' }, { t: '1', k: 'num' }, { t: ');' }] },
      { n: 5, parts: [{ t: '}' }] },
    ],
    tag: c.trackYear1Tag,
    title: c.trackYear1Title,
    body: c.trackYear1Body,
    cta: c.trackYear1Cta,
    href: '/courses',
  },
  {
    file: 'grade-02/functions.js',
    branch: 'main',
    status: 'نشط',
    accent: 'var(--pink)',
    lines: [
      { n: 1, parts: [{ t: '// المستوى التالي', k: 'com' }] },
      { n: 2, parts: [{ t: 'function', k: 'kw' }, { t: ' ' }, { t: 'levelUp', k: 'fn' }, { t: '(student) {' }] },
      { n: 3, parts: [{ t: '  student.skills.push(' }, { t: '"logic"', k: 'str' }, { t: ');' }] },
      { n: 4, parts: [{ t: '  return', k: 'kw' }, { t: ' student.grade + ' }, { t: '1', k: 'num' }, { t: ';' }] },
      { n: 5, parts: [{ t: '}' }] },
    ],
    tag: c.trackYear2Tag,
    title: c.trackYear2Title,
    body: c.trackYear2Body,
    cta: c.trackYear2Cta,
    href: '/courses',
  },
];

export function Tracks() {
  return (
    <div className="lp-tracks">
      {TRACKS.map((t) => (
        <article className="lp-track" key={t.file} style={{ ['--c' as string]: t.accent }}>
          <div className="lp-track__editor">
            <div className="lp-track__bar">
              <span className="lp-track__dot" />
              <span className="lp-track__dot" />
              <span className="lp-track__dot" />
              <span className="lp-track__file">{t.file}</span>
            </div>
            <pre className="lp-track__code">
              {t.lines.map((line) => (
                <div className="lp-track__line" key={line.n}>
                  <span className="lp-track__ln">{line.n}</span>
                  <span>
                    {line.parts.map((p, i) => (
                      <span key={i} className={p.k ? `tok-${p.k}` : undefined}>
                        {p.t}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </pre>
            <div className="lp-track__foot">
              <span>⌥ {t.branch}</span>
              <span className="lp-track__status">● {t.status}</span>
            </div>
          </div>
          <div className="lp-track__meta">
            <span className="lp-track__tag">{t.tag}</span>
            <h3 className="lp-track__title">{t.title}</h3>
            <p className="lp-track__body">{t.body}</p>
            <Link className="lp-btn lp-btn--ghost" href={t.href}>
              {t.cta}
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
