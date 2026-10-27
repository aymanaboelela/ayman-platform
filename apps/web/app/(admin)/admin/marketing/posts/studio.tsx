'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AlarmClock, CalendarDays, ChevronLeft, ChevronRight, Inbox, Link2, Pencil, RefreshCw, Settings2, Sparkles } from 'lucide-react';
import { socialPostsCopy } from '@ayman/contracts/copy/social-posts';
import type { SocialPost, SocialPostList } from '@ayman/contracts/social/posts';
import { cairoDay, dayLabel, timeLabel, type CalendarView } from '@/lib/social-posts/calendar';
import type { PostBrand } from '@/lib/social-posts/draw-post';
import { patchPostAction, scanAction } from './actions';
import { KindIcon } from './kind-icon';
import { PostEditor } from './post-editor';
import { postTitle } from './post-title';

const s = socialPostsCopy;

export interface StudioCalendar {
  view: CalendarView;
  anchor: string;
  today: string;
  days: string[];
  month: string;
  previous: string;
  next: string;
}

export interface PostsStudioProps {
  list: SocialPostList;
  calendar: StudioCalendar;
  brand: PostBrand;
  canWrite: boolean;
  canPublish: boolean;
}

const BASE = '/admin/marketing/posts';
const href = (view: CalendarView, d: string) => `${BASE}?view=${view}&d=${d}`;

/**
 * «استوديو البوستات» — the inbox of drafts beside the calendar, and the
 * editor over both. Every write is a Server Action that revalidates this
 * route, so the lists below are always the server's, re-rendered.
 */
export function PostsStudio({ list, calendar, brand, canWrite, canPublish }: PostsStudioProps) {
  // The post as it was when opened. Not looked up by id on every render:
  // scheduling a post for next week takes it out of this page's lists, and
  // the editor must not vanish under the admin's hand when that happens.
  const [opened, setOpened] = useState<SocialPost | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const connected = list.connection.facebook || list.connection.instagram;

  const scan = () => {
    setScanMessage(null);
    startTransition(async () => {
      const result = await scanAction();
      setScanMessage(result.ok ? s.scanFound(result.data.created) : result.message);
    });
  };

  const skip = (post: SocialPost) => startTransition(async () => void (await patchPostAction(post.id, { status: 'skipped' })));

  return (
    <div className="sp">
      <section className="sp-hero" aria-labelledby="sp-title">
        <div className="min-w-0">
          <h1 id="sp-title" className="sp-hero__title">
            {s.title}
          </h1>
          <p className="sp-hero__lead">{s.lead}</p>
          <div className="sp-hero__stats mt-3">
            <span className="sp-stat">
              <Inbox className="size-4" aria-hidden="true" />
              {s.statuses.draft} <b>{list.counts.draft.toLocaleString('ar-EG')}</b>
            </span>
            <span className="sp-stat">
              <CalendarDays className="size-4" aria-hidden="true" />
              {s.statuses.scheduled} <b>{list.counts.scheduled.toLocaleString('ar-EG')}</b>
            </span>
            <span className="sp-stat">
              <Sparkles className="size-4" aria-hidden="true" />
              {s.statuses.published} <b>{list.counts.published.toLocaleString('ar-EG')}</b>
            </span>
            <span className={connected ? 'sp-stat sp-stat--on' : 'sp-stat sp-stat--off'}>
              <Link2 className="size-4" aria-hidden="true" />
              {connected
                ? [list.connection.facebook ? s.facebook : null, list.connection.instagram ? s.instagram : null].filter(Boolean).join(' · ')
                : s.notConnected}
            </span>
          </div>
        </div>
        <div className="grid gap-2">
          <div className="sp-hero__actions">
            {canWrite ? (
              <button type="button" className="sp-hero__btn" disabled={pending} onClick={scan}>
                <RefreshCw className={pending ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'} aria-hidden="true" />
                {pending ? s.scanning : s.scanNow}
              </button>
            ) : null}
            {canPublish ? (
              <Link href={`${BASE}/settings`} className="sp-hero__btn sp-hero__btn--ghost">
                <Settings2 className="size-4" aria-hidden="true" />
                {s.settings}
              </Link>
            ) : null}
          </div>
          <p className="sp-hero__meta" aria-live="polite">
            {scanMessage ??
              `${s.lastScan}: ${list.lastScanAt ? `${dayLabel(cairoDay(list.lastScanAt))} · ${timeLabel(list.lastScanAt)}` : s.never}`}
          </p>
        </div>
      </section>

      {list.overdue.length > 0 ? (
        <section className="sp-overdue" aria-labelledby="sp-overdue">
          <h2 id="sp-overdue" className="sp-overdue__title">
            <AlarmClock className="size-5" aria-hidden="true" />
            {s.overdue}
            <span className="sp-count">{list.overdue.length.toLocaleString('ar-EG')}</span>
          </h2>
          <div className="sp-overdue__list">
            {list.overdue.map((post) => (
              <button key={post.id} type="button" className="sp-pill max-w-[18rem]" data-kind={post.kind} onClick={() => setOpened(post)}>
                <span className="sp-pill__time">
                  {post.scheduledAt ? `${dayLabel(cairoDay(post.scheduledAt))} · ${timeLabel(post.scheduledAt)}` : ''}
                </span>
                <span className="sp-pill__title">{postTitle(post.facts)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="sp-layout">
        <section className="sp-panel" aria-labelledby="sp-inbox">
          <div className="sp-panel__head">
            <h2 id="sp-inbox" className="sp-panel__title">
              <Inbox className="size-5 text-[color:var(--viz-3)]" aria-hidden="true" />
              {s.inbox}
              <span className="sp-count">{list.counts.draft.toLocaleString('ar-EG')}</span>
            </h2>
          </div>
          {list.drafts.length === 0 ? (
            <div className="sp-empty">
              <Sparkles className="size-8 text-[color:var(--viz-3)]" aria-hidden="true" />
              {s.inboxEmpty}
            </div>
          ) : (
            <ul className="sp-inbox" role="list">
              {list.drafts.map((post) => (
                <li key={post.id} className="sp-card" data-kind={post.kind}>
                  <button type="button" className="sp-card__thumb" onClick={() => setOpened(post)} aria-label={`${s.edit}: ${postTitle(post.facts)}`}>
                    {post.imageUrl ? <img src={post.imageUrl} alt="" loading="lazy" /> : <KindIcon kind={post.kind} className="size-8" />}
                  </button>
                  <div className="sp-card__body">
                    <div className="sp-card__meta">
                      <span className="sp-chip">
                        <KindIcon kind={post.kind} className="size-3.5" />
                        {s.kinds[post.kind]}
                      </span>
                      <span>{dayLabel(cairoDay(post.createdAt))}</span>
                    </div>
                    <p className="sp-card__title">{postTitle(post.facts)}</p>
                    <div className="sp-card__actions">
                      <button type="button" className="sp-mini sp-mini--primary" onClick={() => setOpened(post)}>
                        <Pencil className="size-3.5" aria-hidden="true" />
                        {s.edit}
                      </button>
                      {canWrite ? (
                        <button type="button" className="sp-mini sp-mini--danger" disabled={pending} onClick={() => skip(post)}>
                          {s.skip}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <CalendarPanel calendar={calendar} posts={list.calendar} onOpen={setOpened} />
      </div>

      {opened ? (
        <PostEditor
          key={opened.id}
          post={opened}
          open
          onOpenChange={(next) => {
            if (!next) setOpened(null);
          }}
          brand={brand}
          connection={list.connection}
          canWrite={canWrite}
          canPublish={canPublish}
        />
      ) : null}
    </div>
  );
}

function CalendarPanel({
  calendar,
  posts,
  onOpen,
}: {
  calendar: StudioCalendar;
  posts: SocialPost[];
  onOpen: (post: SocialPost) => void;
}) {
  const byDay = new Map<string, SocialPost[]>();
  for (const post of posts) {
    const at = post.status === 'published' ? post.publishedAt : post.scheduledAt;
    if (!at) continue;
    const day = cairoDay(at);
    byDay.set(day, [...(byDay.get(day) ?? []), post]);
  }

  const first = calendar.days[0]!;
  const last = calendar.days.at(-1)!;
  const label =
    calendar.view === 'month'
      ? dayLabel(`${calendar.month}-01`, { month: 'long', year: 'numeric' })
      : `${dayLabel(first)} — ${dayLabel(last)}`;

  return (
    <section className="sp-panel" aria-labelledby="sp-calendar">
      <div className="sp-panel__head">
        <h2 id="sp-calendar" className="sp-panel__title">
          <CalendarDays className="size-5 text-[color:var(--viz-5)]" aria-hidden="true" />
          {s.calendar}
        </h2>
        <div className="sp-seg" role="group" aria-label={s.calendar}>
          <Link href={href('week', calendar.anchor)} aria-current={calendar.view === 'week' ? 'page' : undefined}>
            {s.week}
          </Link>
          <Link href={href('month', calendar.anchor)} aria-current={calendar.view === 'month' ? 'page' : undefined}>
            {s.month}
          </Link>
        </div>
      </div>

      <div className="sp-cal__bar">
        <span className="sp-cal__label">{label}</span>
        {/* RTL: «previous» points right, «next» left. */}
        <Link href={href(calendar.view, calendar.previous)} className="sp-nav" aria-label={s.previous}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
        <Link href={href(calendar.view, calendar.today)} className="sp-nav sp-nav--text">
          {s.today}
        </Link>
        <Link href={href(calendar.view, calendar.next)} className="sp-nav" aria-label={s.next}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="sp-grid" data-view={calendar.view}>
        {s.weekdays.map((name) => (
          <div key={name} className="sp-grid__head" aria-hidden="true">
            {name}
          </div>
        ))}
        {calendar.days.map((day, index) => {
          const items = byDay.get(day) ?? [];
          return (
            <div
              key={day}
              className="sp-day"
              data-today={day === calendar.today}
              data-outside={calendar.view === 'month' && !day.startsWith(calendar.month)}
            >
              <div className="sp-day__date">
                <span className="sp-day__dow">{s.weekdays[index % 7]}</span>
                <span>{dayLabel(day, { day: 'numeric', month: calendar.view === 'week' ? 'short' : undefined })}</span>
              </div>
              {items.length === 0 ? <span className="sp-day__empty">{s.dayEmpty}</span> : null}
              {items.map((post) => {
                const at = post.status === 'published' ? post.publishedAt : post.scheduledAt;
                return (
                  <button key={post.id} type="button" className="sp-pill" data-kind={post.kind} data-status={post.status} onClick={() => onOpen(post)}>
                    <span className="sp-pill__time">
                      <KindIcon kind={post.kind} className="me-1 inline size-3" />
                      {at ? timeLabel(at) : ''} · {s.statuses[post.status]}
                    </span>
                    <span className="sp-pill__title">{postTitle(post.facts)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
