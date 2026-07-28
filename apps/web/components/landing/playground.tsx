'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts';

const c = copy.landing;

const SAMPLE = `console.log("أهلاً يا مبرمج 👋");

const name = "أيمن";
console.log(\`منصة أ. \${name}\`);

const a = 7, b = 5;
console.log(\`المجموع = \${a + b}\`);

for (let i = 1; i <= 3; i++) {
  console.log(\`تكرار رقم \${i}\`);
}`;

interface RunResult {
  out: string[];
  error: string | null;
}

/**
 * Runs the student's code inside a throwaway Web Worker: isolated from the page
 * (no DOM, cookies or app state), console.* is captured and streamed back, and a
 * hard timeout terminates runaway loops so the tab never freezes. Our own
 * implementation — a standard sandboxed-eval pattern, not lifted from anywhere.
 */
function runCode(code: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const src = `self.onmessage=function(ev){
      var out=[];
      var show=function(v){try{return (typeof v==='object'&&v!==null)?JSON.stringify(v):String(v)}catch(_){return String(v)}};
      var push=function(p,args){out.push(p+[].map.call(args,show).join(' '))};
      var console={log:function(){push('',arguments)},info:function(){push('',arguments)},warn:function(){push('⚠ ',arguments)},error:function(){push('⛔ ',arguments)}};
      try{ (new Function('console', ev.data))(console); self.postMessage({out:out,error:null}); }
      catch(err){ self.postMessage({out:out,error:String((err&&err.message)||err)}); }
    };`;
    let url = '';
    let worker: Worker | null = null;
    const done = (r: RunResult) => {
      if (worker) worker.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve(r);
    };
    try {
      url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      worker = new Worker(url);
      const timer = setTimeout(() => done({ out: [], error: c.playTimeout }), 2500);
      worker.onmessage = (ev: MessageEvent<RunResult>) => {
        clearTimeout(timer);
        done(ev.data);
      };
      worker.onerror = (ev) => {
        clearTimeout(timer);
        done({ out: [], error: String(ev.message || 'خطأ') });
      };
      worker.postMessage(code);
    } catch {
      done({ out: [], error: 'مش قادرين نشغّل الكود دلوقتي' });
    }
  });
}

export function Playground() {
  const [code, setCode] = useState(SAMPLE);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const r = await runCode(code);
    setResult(r);
    setRunning(false);
  }

  return (
    <div className="lp-play">
      <div className="lp-play__editor">
        <div className="lp-play__bar">
          <span className="lp-track__dot" />
          <span className="lp-track__dot" />
          <span className="lp-track__dot" />
          <span className="lp-track__file">playground.js</span>
        </div>
        <textarea
          className="lp-play__code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          dir="ltr"
          aria-label="محرّر الكود"
        />
        <div className="lp-play__actions">
          <button className="lp-btn lp-btn--primary" type="button" onClick={() => void run()} disabled={running}>
            {running ? c.playRunning : `${c.playRun} ▶`}
          </button>
          <button
            className="lp-btn lp-btn--ghost"
            type="button"
            onClick={() => {
              setCode(SAMPLE);
              setResult(null);
            }}
          >
            {c.playReset}
          </button>
        </div>
      </div>

      <div className="lp-play__console" dir="ltr">
        <div className="lp-play__ctitle">{c.playConsole}</div>
        {!result ? (
          <p className="lp-play__empty" dir="rtl">
            {c.playEmpty}
          </p>
        ) : (
          <>
            {result.out.map((line, i) => (
              <div className="lp-play__line" key={i}>
                {line}
              </div>
            ))}
            {result.error ? <div className="lp-play__err">⛔ {result.error}</div> : null}
            {result.out.length === 0 && !result.error ? (
              <p className="lp-play__empty" dir="rtl">
                تمام — الكود اشتغل من غير أي ناتج.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
