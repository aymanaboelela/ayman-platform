'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, KeyRound, Link2, PlugZap, Save, ShieldCheck } from 'lucide-react';
import { socialPostsCopy } from '@ayman/contracts/copy/social-posts';
import type { SocialConnection, SocialConnectionTest } from '@ayman/contracts/social/posts';
import { saveConnectionAction, testConnectionAction } from '../actions';

const s = socialPostsCopy.connection;

type Notice = { tone: 'ok' | 'err'; text: string } | null;

/**
 * The connection form. The token field is NEVER pre-filled — the API does
 * not hand it back — so an untouched save sends no `accessToken` at all and
 * the stored one is kept; «مسح التوكن» sends `null`.
 */
export function ConnectionForm({ initial }: { initial: SocialConnection }) {
  const [connection, setConnection] = useState(initial);
  const [pageId, setPageId] = useState(initial.pageId ?? '');
  const [instagramUserId, setInstagramUserId] = useState(initial.instagramUserId ?? '');
  const [token, setToken] = useState('');
  const [hashtags, setHashtags] = useState(initial.hashtags);
  const [notice, setNotice] = useState<Notice>(null);
  const [test, setTest] = useState<SocialConnectionTest | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (forget = false) => {
    setNotice(null);
    startTransition(async () => {
      const result = await saveConnectionAction({
        pageId: pageId.trim() || null,
        instagramUserId: instagramUserId.trim() || null,
        ...(forget ? { accessToken: null } : token.trim() ? { accessToken: token.trim() } : {}),
        hashtags: hashtags.trim(),
      });
      if (!result.ok) {
        setNotice({ tone: 'err', text: result.message });
        return;
      }
      setConnection(result.data);
      setToken('');
      setNotice({ tone: 'ok', text: s.saved });
    });
  };

  const runTest = () => {
    setTest(null);
    startTransition(async () => {
      const result = await testConnectionAction();
      setTest(result.ok ? result.data : { ok: false, pageName: null, instagramUserId: null, error: result.message });
    });
  };

  return (
    <div className="sp">
      <section className="sp-hero" aria-labelledby="sp-connection">
        <div className="min-w-0">
          <h1 id="sp-connection" className="sp-hero__title">
            {s.title}
          </h1>
          <p className="sp-hero__lead">{s.lead}</p>
        </div>
        <div className="sp-hero__actions">
          <Link href="/admin/marketing/posts" className="sp-hero__btn sp-hero__btn--ghost">
            <ArrowRight className="size-4" aria-hidden="true" />
            {s.back}
          </Link>
        </div>
      </section>

      <div className="sp-layout">
        <section className="sp-panel" aria-labelledby="sp-steps">
          <div className="sp-panel__head">
            <h2 id="sp-steps" className="sp-panel__title">
              <KeyRound className="size-5 text-[color:var(--viz-3)]" aria-hidden="true" />
              {s.stepsTitle}
            </h2>
          </div>
          <ol className="sp-steps">
            {s.steps.map((step) => (
              <li key={step.text}>
                <div>
                  {step.text}
                  {step.codes.length > 0 ? (
                    <div>
                      {step.codes.map((code) => (
                        <code key={code} className="sp-code">
                          {code}
                        </code>
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="sp-panel" aria-labelledby="sp-form">
          <div className="sp-panel__head">
            <h2 id="sp-form" className="sp-panel__title">
              <Link2 className="size-5 text-[color:var(--viz-5)]" aria-hidden="true" />
              {s.title}
            </h2>
            <span className="sp-status" data-status={connection.tokenSet ? 'published' : 'draft'}>
              {connection.tokenSet && connection.tokenHint ? s.tokenHint(connection.tokenHint) : s.tokenNone}
            </span>
          </div>

          <div className="sp-fields">
            <label className="sp-field">
              <span className="sp-field__label">{s.pageId}</span>
              <input className="sp-input sp-ltr" inputMode="numeric" value={pageId} onChange={(e) => setPageId(e.target.value)} />
            </label>
            <label className="sp-field">
              <span className="sp-field__label">{s.instagramUserId}</span>
              <input
                className="sp-input sp-ltr"
                inputMode="numeric"
                value={instagramUserId}
                onChange={(e) => setInstagramUserId(e.target.value)}
              />
            </label>
            <label className="sp-field">
              <span className="sp-field__label">{s.token}</span>
              <input
                className="sp-input sp-ltr"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                placeholder={connection.tokenSet ? s.tokenKeep : ''}
                onChange={(e) => setToken(e.target.value)}
              />
              <span className="sp-field__hint">
                <ShieldCheck className="me-1 inline size-3.5" aria-hidden="true" />
                {s.secretNote}
              </span>
            </label>
            <label className="sp-field">
              <span className="sp-field__label">{s.hashtags}</span>
              <input className="sp-input" value={hashtags} placeholder={s.hashtagsHint} onChange={(e) => setHashtags(e.target.value)} />
            </label>

            {notice ? <p className={notice.tone === 'ok' ? 'sp-note' : 'sp-error'}>{notice.text}</p> : null}

            <div className="sp-actions">
              <button type="button" className="sp-mini sp-mini--primary" disabled={pending} onClick={() => save()}>
                <Save className="size-4" aria-hidden="true" />
                {s.save}
              </button>
              <button type="button" className="sp-mini sp-mini--blue" disabled={pending || !connection.tokenSet} onClick={runTest}>
                <PlugZap className="size-4" aria-hidden="true" />
                {pending ? s.testing : s.test}
              </button>
              {connection.tokenSet ? (
                <button type="button" className="sp-mini sp-mini--danger" disabled={pending} onClick={() => save(true)}>
                  {s.forgetToken}
                </button>
              ) : null}
            </div>

            {test ? (
              test.ok ? (
                <div className="sp-note grid gap-2">
                  <span>{s.testOk(test.pageName ?? '')}</span>
                  {test.instagramUserId && test.instagramUserId !== instagramUserId ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="sp-code">{test.instagramUserId}</code>
                      <button type="button" className="sp-mini" onClick={() => setInstagramUserId(test.instagramUserId ?? '')}>
                        {s.useInstagram}
                      </button>
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="sp-error">
                  {s.testFailed}
                  {test.error ? (
                    <>
                      {' — '}
                      <span className="sp-ltr">{test.error}</span>
                    </>
                  ) : null}
                </p>
              )
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
