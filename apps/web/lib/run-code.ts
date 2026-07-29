'use client';

import { copy } from '@ayman/contracts';

const c = copy.landing;

/** Runaway loops are terminated at this point rather than freezing the tab. */
const TIMEOUT_MS = 2500;

export type RunResult = {
  out: string[];
  error: string | null;
};

/**
 * Runs student code inside a throwaway Web Worker.
 *
 * `new Function` on user input is the entire point here — a playground that
 * cannot run what you typed is not a playground — so the containment is what
 * matters:
 *
 * - **No DOM, no app state.** A worker has neither, so nothing on the page can
 *   be read or altered by the snippet.
 * - **No network.** A worker created from a blob URL inherits the *page's*
 *   origin, which means `fetch('/api/…', { credentials: 'include' })` would
 *   otherwise run as the signed-in student. The three network entry points are
 *   deleted before any user code is compiled, so a snippet copied off the
 *   internet cannot quietly call our API with the reader's session.
 * - **Bounded.** A runaway loop is terminated after `TIMEOUT_MS`; the tab never
 *   freezes.
 * - **Disposable.** The worker and the object URL backing it are torn down on
 *   every exit path, including the timeout, so repeated runs leak neither
 *   threads nor blobs.
 *
 * Extracted from the old landing playground so the marketing shell can be
 * rebuilt independently of the evaluator, which is the part with actual
 * security relevance.
 */
export function runCode(code: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const src = `self.fetch=undefined;self.XMLHttpRequest=undefined;self.importScripts=undefined;self.WebSocket=undefined;self.EventSource=undefined;
    self.onmessage=function(ev){
      var out=[];
      var show=function(v){try{return (typeof v==='object'&&v!==null)?JSON.stringify(v):String(v)}catch(_){return String(v)}};
      var push=function(p,args){out.push(p+[].map.call(args,show).join(' '))};
      var console={log:function(){push('',arguments)},info:function(){push('',arguments)},warn:function(){push('⚠ ',arguments)},error:function(){push('⛔ ',arguments)}};
      try{ (new Function('console', ev.data))(console); self.postMessage({out:out,error:null}); }
      catch(err){ self.postMessage({out:out,error:String((err&&err.message)||err)}); }
    };`;

    let url = '';
    let worker: Worker | null = null;

    const done = (result: RunResult) => {
      if (worker) worker.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve(result);
    };

    try {
      url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      worker = new Worker(url);

      const timer = setTimeout(() => done({ out: [], error: c.playTimeout }), TIMEOUT_MS);

      worker.onmessage = (ev: MessageEvent<RunResult>) => {
        clearTimeout(timer);
        done(ev.data);
      };
      worker.onerror = (ev) => {
        clearTimeout(timer);
        done({ out: [], error: String(ev.message || c.playWorkerError) });
      };

      worker.postMessage(code);
    } catch {
      // Blob URLs or workers blocked outright (a strict CSP, some embedded
      // webviews). The lab degrades to "cannot run" rather than throwing.
      done({ out: [], error: c.playUnavailable });
    }
  });
}
