'use client';

import { useMemo, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Eye,
  Film,
  HeartPulse,
  Link2,
  ListChecks,
  MonitorPlay,
  Pencil,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Unplug,
  Users,
  WandSparkles,
} from 'lucide-react';
import { youtubeStudioCopy } from '@ayman/contracts/copy/youtube-studio';
import {
  YOUTUBE_VIDEO_FLAGS,
  type YoutubeStudioState,
  type YoutubeVideoDetail,
  type YoutubeVideoFlag,
  type YoutubeVideoList,
  type YoutubeVideoRow,
} from '@ayman/contracts/youtube/studio';
import { CHECKLIST, channelHealth, checklist, type CheckState } from '@/lib/youtube-studio/health';
import { disconnectAction, loadVideosAction, markHandledAction, startConnectAction } from './actions';
import { CheckIcon, formatDate } from './parts';
import { VideoEditor, type EditorMode } from './video-editor';

const y = youtubeStudioCopy;

export type CallbackOutcome = 'connected' | 'denied' | 'expired' | 'noChannel' | 'noRefresh' | 'failed';

export interface YoutubeStudioProps {
  state: YoutubeStudioState;
  initialList: YoutubeVideoList | null;
  listError: string | null;
  callback: CallbackOutcome | null;
  openVideo: string | null;
  canWrite: boolean;
  canPublish: boolean;
}

type Filter = 'all' | 'new' | YoutubeVideoFlag;
type Notice = { tone: 'ok' | 'err'; text: string } | null;

const compact = new Intl.NumberFormat('ar-EG', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('ar-EG');

/** Fixed hues per flag — the strip, the chips and the card edges read by colour before a word is read. */
const FLAG_ICON: Record<YoutubeVideoFlag, typeof CircleAlert> = {
  noDescription: Pencil,
  noSiteLink: Link2,
  noTags: Sparkles,
  noChapters: ListChecks,
};

/**
 * «يوتيوب» — the channel, its health, the newest upload waiting to be tended,
 * and every loaded video as a card with its own «تعديل».
 *
 * Filters and search run over the videos ALREADY LOADED (50 a page): a
 * channel-wide search would be `search.list` at 100 quota units a press, and
 * this screen never spends quota by itself.
 */
export function YoutubeStudio({ state, initialList, listError, callback, openVideo, canWrite, canPublish }: YoutubeStudioProps) {
  const [items, setItems] = useState<YoutubeVideoRow[]>(initialList?.items ?? []);
  const [nextPage, setNextPage] = useState<string | null>(initialList?.nextPageToken ?? null);
  const [total] = useState<number | null>(initialList?.totalResults ?? null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [newVideos, setNewVideos] = useState(state.newVideos);
  const [editing, setEditing] = useState<{ id: string; mode: EditorMode } | null>(
    openVideo ? { id: openVideo, mode: state.newVideos.some((v) => v.id === openVideo) ? 'new' : 'edit' } : null,
  );
  const [notice, setNotice] = useState<Notice>(
    callback === 'connected'
      ? { tone: 'ok', text: y.callback.connected }
      : callback
        ? { tone: 'err', text: y.callback[callback] }
        : listError
          ? { tone: 'err', text: listError }
          : null,
  );
  const [loadingMore, startLoadingMore] = useTransition();
  const [connecting, startConnecting] = useTransition();
  const [disconnecting, startDisconnecting] = useTransition();

  const health = useMemo(() => channelHealth(items), [items]);
  const counts = useMemo(() => ({ new: items.filter((item) => item.isNew).length }), [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'new' && !item.isNew) return false;
      if (filter !== 'all' && filter !== 'new' && !item.flags.includes(filter)) return false;
      return needle === '' || item.title.toLowerCase().includes(needle);
    });
  }, [items, filter, query]);

  const connect = () => {
    setNotice(null);
    startConnecting(async () => {
      const result = await startConnectAction();
      if (!result.ok) {
        setNotice({ tone: 'err', text: result.message });
        return;
      }
      window.location.assign(result.data.url);
    });
  };

  const disconnect = () => {
    if (!window.confirm(y.channel.disconnectConfirm)) return;
    startDisconnecting(async () => {
      const result = await disconnectAction();
      setNotice(result.ok ? { tone: 'ok', text: y.channel.disconnected } : { tone: 'err', text: result.message });
    });
  };

  const loadMore = () => {
    if (!nextPage) return;
    startLoadingMore(async () => {
      const result = await loadVideosAction(nextPage);
      if (!result.ok) {
        setNotice({ tone: 'err', text: result.message });
        return;
      }
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.data.items.filter((item) => !seen.has(item.id))];
      });
      setNextPage(result.data.nextPageToken);
    });
  };

  const refresh = () => {
    startLoadingMore(async () => {
      const result = await loadVideosAction(null);
      if (!result.ok) {
        setNotice({ tone: 'err', text: result.message });
        return;
      }
      setItems(result.data.items);
      setNextPage(result.data.nextPageToken);
    });
  };

  /** A save in the editor: the card shows what YouTube now has, and «جديد» ends. */
  const onSaved = (detail: YoutubeVideoDetail) => {
    setItems((current) => current.map((item) => (item.id === detail.id ? { ...item, ...pickRow(detail), isNew: false } : item)));
    setNewVideos((current) => current.filter((video) => video.id !== detail.id));
  };

  /** A new thumbnail is not «handled» — the card just shows it. */
  const onThumbnail = (detail: YoutubeVideoDetail) => {
    setItems((current) =>
      current.map((item) => (item.id === detail.id ? { ...item, thumbnailUrl: detail.thumbnailUrl, thumbnailSetHere: true } : item)),
    );
  };

  const dismiss = async (id: string) => {
    const result = await markHandledAction(id);
    if (!result.ok) {
      setNotice({ tone: 'err', text: result.message });
      return;
    }
    setNewVideos((current) => current.filter((video) => video.id !== id));
    setItems((current) => current.map((item) => (item.id === id ? { ...item, isNew: false } : item)));
    setNotice({ tone: 'ok', text: y.newVideo.dismissed });
  };

  // ── Not configured on this stack ────────────────────────────────────────
  if (!state.configured && !state.connection) {
    return (
      <div className="yt">
        <Hero>
          <h1 className="yt-hero__title">{y.title}</h1>
          <p className="yt-hero__lead">{y.lead}</p>
        </Hero>
        <section className="yt-empty yt-empty--muted">
          <span className="yt-empty__icon" aria-hidden="true">
            <PlugZap className="size-7" />
          </span>
          <h2 className="yt-empty__title">{y.unavailable.title}</h2>
          <p className="yt-empty__body">{y.unavailable.body}</p>
        </section>
      </div>
    );
  }

  // ── Configured, nothing connected ───────────────────────────────────────
  if (!state.connection) {
    return (
      <div className="yt">
        <Hero>
          <h1 className="yt-hero__title">{y.title}</h1>
          <p className="yt-hero__lead">{y.lead}</p>
        </Hero>
        {notice ? <NoticeLine notice={notice} /> : null}
        <section className="yt-connect" aria-labelledby="yt-connect-title">
          <div className="yt-connect__art" aria-hidden="true">
            <MonitorPlay className="size-12" />
          </div>
          <div className="yt-connect__body">
            <h2 id="yt-connect-title" className="yt-connect__title">
              {y.connect.title}
            </h2>
            <p className="yt-connect__lead">{y.connect.body}</p>
            <ul className="yt-connect__points">
              {y.connect.points.map((point) => (
                <li key={point}>
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
            {canPublish ? (
              <button type="button" className="yt-btn yt-btn--primary yt-btn--lg" disabled={connecting} onClick={connect}>
                <PlugZap className="size-5" aria-hidden="true" />
                {connecting ? y.connect.working : y.connect.button}
              </button>
            ) : null}
            <p className="yt-connect__note">{y.newVideo.uploadsNote}</p>
          </div>
        </section>
      </div>
    );
  }

  // ── Connected ───────────────────────────────────────────────────────────
  const { channel, tokenHint } = state.connection;
  const featured = newVideos[0] ?? null;
  const featuredRow = featured ? items.find((item) => item.id === featured.id) ?? null : null;

  return (
    <div className="yt">
      <Hero>
        <div className="yt-channel">
          {channel.avatarUrl ? (
            <Image className="yt-channel__avatar" src={channel.avatarUrl} alt="" width={72} height={72} />
          ) : (
            <span className="yt-channel__avatar yt-channel__avatar--empty" aria-hidden="true">
              <MonitorPlay className="size-8" />
            </span>
          )}
          <div className="min-w-0">
            <p className="yt-hero__eyebrow">{y.title}</p>
            <h1 className="yt-hero__title" dir="auto">
              {channel.title}
            </h1>
            <div className="yt-hero__stats">
              <span className="yt-stat">
                <Users className="size-4" aria-hidden="true" />
                {channel.subscriberCount === null ? y.channel.hiddenSubscribers : y.channel.subscribers(channel.subscriberCount)}
              </span>
              {channel.videoCount !== null ? (
                <span className="yt-stat">
                  <Film className="size-4" aria-hidden="true" />
                  {y.channel.videos(channel.videoCount)}
                </span>
              ) : null}
              {tokenHint ? (
                <span className="yt-stat yt-stat--soft">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  {y.channel.tokenHint(tokenHint)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="yt-hero__actions">
          <a
            className="yt-btn yt-btn--light"
            href={channel.customUrl ? `https://www.youtube.com/${channel.customUrl}` : `https://www.youtube.com/channel/${channel.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {y.channel.openOnYoutube}
          </a>
          {canPublish ? (
            <button type="button" className="yt-btn yt-btn--ghost" disabled={disconnecting} onClick={disconnect}>
              <Unplug className="size-4" aria-hidden="true" />
              {disconnecting ? y.channel.disconnecting : y.channel.disconnect}
            </button>
          ) : null}
        </div>
      </Hero>

      {notice ? <NoticeLine notice={notice} /> : null}

      {featured ? (
        <section className="yt-new" aria-labelledby="yt-new-title">
          <div className="yt-new__media">
            {featured.thumbnailUrl ? (
              // A plain <img>: i.ytimg.com is in the CSP, and the optimizer would only re-encode YouTube's own JPEG.
              <img src={featured.thumbnailUrl} alt="" className="yt-new__thumb" loading="eager" />
            ) : (
              <span className="yt-new__thumb yt-new__thumb--empty" aria-hidden="true">
                <MonitorPlay className="size-10" />
              </span>
            )}
            <span className="yt-badge yt-badge--new">{y.newBadge}</span>
          </div>
          <div className="yt-new__body">
            <p id="yt-new-title" className="yt-new__eyebrow">
              <Sparkles className="size-4" aria-hidden="true" />
              {y.newVideo.eyebrow}
            </p>
            <h2 className="yt-new__title" dir="auto">
              {featured.title}
            </h2>
            {featured.publishedAt ? <p className="yt-new__meta">{y.newVideo.published(formatDate(featured.publishedAt))}</p> : null}

            <div className="yt-checklist" aria-label={y.newVideo.checklistTitle}>
              <p className="yt-checklist__title">{y.newVideo.checklistTitle}</p>
              <ul>
                {CHECKLIST.map((key) => {
                  const status: CheckState = featuredRow ? checklist(featuredRow)[key] : 'unknown';
                  return (
                    <li key={key} data-check={status} title={key === 'thumbnail' && status === 'unknown' ? y.newVideo.thumbnailUnknown : undefined}>
                      <CheckIcon state={status} />
                      {y.newVideo.checks[key]}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="yt-new__actions">
              {canPublish ? (
                <button type="button" className="yt-btn yt-btn--primary yt-btn--lg" onClick={() => setEditing({ id: featured.id, mode: 'new' })}>
                  <WandSparkles className="size-5" aria-hidden="true" />
                  {y.newVideo.suggestAll}
                </button>
              ) : null}
              <button type="button" className="yt-btn yt-btn--soft" onClick={() => setEditing({ id: featured.id, mode: 'edit' })}>
                <Pencil className="size-4" aria-hidden="true" />
                {y.newVideo.edit}
              </button>
              {canWrite ? (
                <button type="button" className="yt-btn yt-btn--plain" onClick={() => void dismiss(featured.id)}>
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {y.newVideo.dismiss}
                </button>
              ) : null}
            </div>
            {newVideos.length > 1 ? <p className="yt-new__more">{y.newVideo.more(newVideos.length - 1)}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="yt-health" aria-labelledby="yt-health-title">
        <div className="yt-health__score" data-grade={health.grade ?? 'none'}>
          <HeartPulse className="size-5" aria-hidden="true" />
          <div>
            <p id="yt-health-title" className="yt-health__label">
              {y.health.title}
            </p>
            <p className="yt-health__value">
              {health.score === null ? '—' : `${whole.format(health.score)}٪`}
              {health.grade ? <span className="yt-health__grade">{y.health.grades[health.grade]}</span> : null}
            </p>
            {health.basis > 0 ? <p className="yt-health__basis">{y.health.basis(health.basis)}</p> : null}
          </div>
          <span className="yt-health__ring" style={{ '--yt-score': `${health.score ?? 0}` } as CSSProperties} aria-hidden="true" />
        </div>
        {YOUTUBE_VIDEO_FLAGS.map((flag) => {
          const Icon = FLAG_ICON[flag];
          const count = health.counts[flag];
          return (
            <button
              key={flag}
              type="button"
              className="yt-health__tile"
              data-flag={flag}
              data-zero={count === 0 ? 'true' : undefined}
              aria-pressed={filter === flag}
              title={y.health.tip}
              onClick={() => setFilter(filter === flag ? 'all' : flag)}
            >
              <span className="yt-health__icon" aria-hidden="true">
                <Icon className="size-4" />
              </span>
              <span className="yt-health__count">{whole.format(count)}</span>
              <span className="yt-health__name">{y.flags[flag]}</span>
            </button>
          );
        })}
      </section>

      <section className="yt-panel" aria-labelledby="yt-list-title">
        <div className="yt-toolbar">
          <h2 id="yt-list-title" className="yt-panel__title">
            <MonitorPlay className="size-5" aria-hidden="true" />
            {y.list.title}
            <span className="yt-panel__count">{y.list.loaded(items.length, total)}</span>
          </h2>
          <div className="yt-toolbar__tools">
            <label className="yt-search">
              <Search className="size-4" aria-hidden="true" />
              <input type="search" value={query} placeholder={y.list.search} onChange={(event) => setQuery(event.target.value)} dir="auto" />
            </label>
            <button type="button" className="yt-btn yt-btn--soft" disabled={loadingMore} onClick={refresh} aria-label={y.list.refresh}>
              <RefreshCw className={loadingMore ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />
              {y.list.refresh}
            </button>
          </div>
        </div>

        <div className="yt-chips" role="group" aria-label={y.list.title}>
          <button type="button" className="yt-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            {y.list.all}
            <b>{whole.format(items.length)}</b>
          </button>
          <button type="button" className="yt-chip" data-flag="new" aria-pressed={filter === 'new'} onClick={() => setFilter('new')}>
            {y.newBadge}
            <b>{whole.format(counts.new)}</b>
          </button>
          {YOUTUBE_VIDEO_FLAGS.map((flag) => (
            <button key={flag} type="button" className="yt-chip" data-flag={flag} aria-pressed={filter === flag} onClick={() => setFilter(flag)}>
              {y.flags[flag]}
              <b>{whole.format(health.counts[flag])}</b>
            </button>
          ))}
        </div>
        {filter !== 'all' || query ? <p className="yt-note">{y.list.weakNote}</p> : null}

        {items.length === 0 && !listError ? (
          <p className="yt-empty-line">{y.list.empty}</p>
        ) : visible.length === 0 ? (
          <p className="yt-empty-line">{y.list.noMatch}</p>
        ) : (
          <ul className="yt-grid">
            {visible.map((item) => (
              <VideoCard key={item.id} item={item} onEdit={() => setEditing({ id: item.id, mode: item.isNew ? 'new' : 'edit' })} />
            ))}
            {loadingMore
              ? Array.from({ length: 3 }, (_, i) => (
                  <li key={`skeleton-${i}`} className="yt-card yt-card--skeleton" aria-hidden="true">
                    <span className="yt-skel yt-skel--thumb" />
                    <span className="yt-skel yt-skel--line" />
                    <span className="yt-skel yt-skel--line yt-skel--short" />
                  </li>
                ))
              : null}
          </ul>
        )}

        {nextPage ? (
          <div className="yt-more">
            <button type="button" className="yt-btn yt-btn--primary" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? y.list.loadingMore : y.list.more}
            </button>
          </div>
        ) : null}
      </section>

      {editing ? (
        <VideoEditor
          key={editing.id}
          videoId={editing.id}
          mode={editing.mode}
          courses={state.courses}
          siteHost={state.siteHost}
          onThumbnail={onThumbnail}
          canWrite={canWrite}
          canPublish={canPublish}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}

function pickRow(detail: YoutubeVideoDetail): Partial<YoutubeVideoRow> {
  return {
    title: detail.title,
    thumbnailUrl: detail.thumbnailUrl,
    privacy: detail.privacy,
    views: detail.views,
    likes: detail.likes,
    flags: detail.flags,
    categoryId: detail.categoryId,
    thumbnailSetHere: detail.thumbnailSetHere,
  };
}

function Hero({ children }: { children: ReactNode }) {
  return <section className="yt-hero">{children}</section>;
}

function NoticeLine({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <p className={notice.tone === 'ok' ? 'yt-notice yt-notice--ok' : 'yt-notice yt-notice--err'} role={notice.tone === 'err' ? 'alert' : 'status'}>
      {notice.tone === 'ok' ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <CircleAlert className="size-4" aria-hidden="true" />}
      {notice.text}
    </p>
  );
}

function VideoCard({ item, onEdit }: { item: YoutubeVideoRow; onEdit: () => void }) {
  const weak = item.flags.length > 0;
  return (
    <li className="yt-card" data-weak={weak ? 'true' : undefined} data-new={item.isNew ? 'true' : undefined}>
      <button type="button" className="yt-card__media" onClick={onEdit} aria-label={`${y.list.edit}: ${item.title}`}>
        {item.thumbnailUrl ? (
          // i.ytimg.com is allowed by the CSP; see the featured card.
          <img src={item.thumbnailUrl} alt="" className="yt-card__thumb" loading="lazy" />
        ) : (
          <span className="yt-card__thumb yt-card__thumb--empty" aria-hidden="true">
            <MonitorPlay className="size-8" />
          </span>
        )}
        {item.privacy ? (
          <span className="yt-badge" data-privacy={item.privacy}>
            {y.privacy[item.privacy]}
          </span>
        ) : null}
        {item.isNew ? <span className="yt-badge yt-badge--new">{y.newBadge}</span> : null}
      </button>
      <div className="yt-card__body">
        <h3 className="yt-card__title" dir="auto">
          {item.title}
        </h3>
        <p className="yt-card__meta">
          {item.views !== null ? (
            <span>
              <Eye className="size-3.5" aria-hidden="true" />
              {compact.format(item.views)} {y.list.views}
            </span>
          ) : null}
          {item.likes !== null ? (
            <span>
              <ThumbsUp className="size-3.5" aria-hidden="true" />
              {compact.format(item.likes)}
            </span>
          ) : null}
          {item.publishedAt ? <span>{formatDate(item.publishedAt)}</span> : null}
        </p>
        {weak ? (
          <ul className="yt-card__flags">
            {item.flags.map((flag) => (
              <li key={flag} className="yt-flag" data-flag={flag}>
                {y.flags[flag]}
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="yt-btn yt-btn--soft yt-card__edit" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden="true" />
          {y.list.edit}
        </button>
      </div>
    </li>
  );
}
