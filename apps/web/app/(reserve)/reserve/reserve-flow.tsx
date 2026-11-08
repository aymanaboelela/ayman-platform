'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  CircleAlert,
  Clock3,
  GraduationCap,
  ImagePlus,
  Laptop,
  MapPin,
  RotateCcw,
  School,
  Wallet,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { formatSlotTime } from '@ayman/contracts/centers';
import { formatCopy } from '@ayman/contracts/format';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import {
  PublicReservationSchema,
  ReservationConfigSchema,
  type PublicReservation,
  type PublicReservationCenter,
  type PublicReservationSlot,
  type ReservationConfig,
  type ReservationGender,
  type ReservationRail,
  type ReservationSystem,
  type ReservationTrack,
} from '@ayman/contracts/center-reservations';
import { Input } from '@ayman/ui/components/input';
import { cn } from '@ayman/ui/lib/cn';
import { ApiRequestError, apiGet, apiPost } from '@/lib/api';
import { formatEGP } from '@/lib/price';
import { uploadReservationScreenshot } from '@/lib/upload-client';
import { AmountCard, CheckoutField, CopyButton, PayStep } from '@/components/site/checkout-parts';
import { PaymentBrand } from '@/components/site/payment-brand';
import { PaymentMethodChoice } from '@/components/site/payment-method-choice';
import '@/components/site/book-checkout.css';

const p = reservationsCopy.page;

/** The reservation this browser made — its id is the bearer (see the API service). */
const STORAGE_KEY = 'center-reservation-id';

type View = 'choose' | 'center' | 'details' | 'group' | 'pay' | 'done';

/** The form's answers, held until a group is picked — the reservation is written then. */
interface Answers {
  fullName: string;
  phone: string;
  gradeSlug: string;
  track: ReservationTrack | null;
  system: ReservationSystem | null;
  gender: ReservationGender | null;
}

/** «نص تمن الحصة», or the percentage when the admin chose another share. */
function shareText(percent: number): string {
  return percent === 50 ? p.shareHalf : formatCopy(p.shareOther, { percent });
}

function errorCode(error: unknown): string | undefined {
  return codeOf(error);
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private mode: the reservation still exists, this browser just will not reopen it.
  }
}

function codeOf(error: unknown): string | undefined {
  if (!(error instanceof ApiRequestError)) return undefined;
  const payload = error.payload as { code?: unknown } | undefined;
  return typeof payload?.code === 'string' ? payload.code : undefined;
}

/** `+2010…` → `010…`, the way it is typed and read aloud. */
function localNumber(e164: string | null): string {
  if (!e164) return '';
  return e164.startsWith('+20') ? `0${e164.slice(3)}` : e164;
}

interface Fetched {
  cfg: ReservationConfig;
  stored: PublicReservation | null;
}

/** The page's config, and the reservation this browser already made (if any). */
async function fetchState(): Promise<Fetched> {
  const [cfg, stored] = await Promise.all([
    apiGet('/api/center-reservations/config', ReservationConfigSchema, { cache: 'no-store' }),
    (async () => {
      const id = readStored();
      if (!id) return null;
      try {
        return await apiGet(`/api/center-reservations/${id}`, PublicReservationSchema, { cache: 'no-store' });
      } catch {
        writeStored(null);
        return null;
      }
    })(),
  ]);
  return { cfg, stored };
}

export function ReserveFlow({ brand }: { brand: string }) {
  const [config, setConfig] = useState<ReservationConfig | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<View>('choose');
  const [center, setCenter] = useState<PublicReservationCenter | null>(null);
  const [reservation, setReservation] = useState<PublicReservation | null>(null);
  const [answers, setAnswers] = useState<Answers | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const apply = useCallback(({ cfg, stored }: Fetched) => {
    setLoadError(false);
    setConfig(cfg);
    if (stored) {
      setReservation(stored);
      setView(stored.status === 'started' ? 'pay' : 'done');
    }
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await fetchState());
    } catch {
      setLoadError(true);
    }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchState()
      .then((result) => {
        if (!cancelled) apply(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  /* Every step starts at its top — a phone keyboard leaves the page scrolled. */
  const go = useCallback((next: View) => {
    setView(next);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, []);

  const startOver = () => {
    writeStored(null);
    setReservation(null);
    setCenter(null);
    go('choose');
  };

  const pickCenterFlow = () => {
    if (config && config.centers.length === 1) {
      setCenter(config.centers[0]!);
      go('details');
    } else {
      go('center');
    }
  };

  const stepIndex = ['center', 'details', 'group', 'pay', 'done'].indexOf(view);

  return (
    <main className="rsv">
      <div ref={topRef} className="rsv-anchor" />
      <header className="rsv-hero">
        <p className="rsv-hero__brand">{brand}</p>
        <p className="rsv-hero__eyebrow">{p.eyebrow}</p>
        <h1 className="rsv-hero__title">{config?.headline || p.defaultHeadline}</h1>
        <p className="rsv-hero__lead">{config?.note || p.lead}</p>
      </header>

      {stepIndex >= 0 ? <Steps current={stepIndex} /> : null}

      {loadError ? (
        <section className="rsv-card rsv-state">
          <span className="rsv-state__icon rsv-state__icon--err" aria-hidden="true">
            <CircleAlert size={28} />
          </span>
          <p className="rsv-state__body">{p.loadFailed}</p>
          <button
            type="button"
            className="rsv-btn rsv-btn--primary"
            onClick={() => {
              setLoadError(false);
              void load();
            }}
          >
            <RotateCcw size={18} aria-hidden="true" />
            {p.retry}
          </button>
        </section>
      ) : config === null ? (
        <Skeleton />
      ) : view === 'choose' ? (
        <Choose open={config.open} onCenter={pickCenterFlow} />
      ) : view === 'center' ? (
        <CenterPick
          centers={config.centers}
          onBack={() => go('choose')}
          onPick={(picked) => {
            setCenter(picked);
            go('details');
          }}
        />
      ) : view === 'details' && center ? (
        <Details
          config={config}
          center={center}
          initial={answers}
          onBack={() => go(config.centers.length === 1 ? 'choose' : 'center')}
          onNext={(next) => {
            setAnswers(next);
            go('group');
          }}
        />
      ) : view === 'group' && center && answers ? (
        <GroupPick
          config={config}
          center={center}
          answers={answers}
          onBack={() => go('details')}
          onOtherCenter={() => go('center')}
          onReload={load}
          onSaved={(saved) => {
            writeStored(saved.id);
            setReservation(saved);
            go(saved.status === 'started' || saved.status === 'rejected' ? 'pay' : 'done');
          }}
        />
      ) : (view === 'pay' || view === 'done') && reservation ? (
        view === 'pay' ? (
          <Pay
            reservation={reservation}
            payPercent={config.payPercent}
            onBack={startOver}
            onDone={(next) => {
              setReservation(next);
              go('done');
            }}
          />
        ) : (
          <Done reservation={reservation} onAgain={() => go('pay')} onNew={startOver} />
        )
      ) : (
        <Choose open={config.open} onCenter={pickCenterFlow} />
      )}
    </main>
  );
}

/* ── Steps ───────────────────────────────────────────────────────────────── */

function Steps({ current }: { current: number }) {
  const labels = [p.stepCenter, p.stepDetails, p.stepGroup, p.stepPay, p.stepDone];
  return (
    <ol className="rsv-steps" aria-label={p.title}>
      {labels.map((label, index) => (
        <li
          key={label}
          className={cn('rsv-steps__item', index < current && 'is-done', index === current && 'is-current')}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className="rsv-steps__dot" aria-hidden="true">
            {index < current ? '✓' : index + 1}
          </span>
          <span className="rsv-steps__label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function Skeleton() {
  return (
    <div className="rsv-grid" aria-busy="true" aria-label={p.loading}>
      <div className="rsv-skel" />
      <div className="rsv-skel" />
    </div>
  );
}

/* ── سنتر ولا أونلاين ───────────────────────────────────────────────────── */

function Choose({ open, onCenter }: { open: boolean; onCenter: () => void }) {
  return (
    <section aria-labelledby="rsv-choose">
      <h2 id="rsv-choose" className="rsv-section-title">
        {p.chooseTitle}
      </h2>
      <div className="rsv-grid">
        {open ? (
          <button type="button" className="rsv-option rsv-option--center" onClick={onCenter}>
            <span className="rsv-option__icon" aria-hidden="true">
              <School size={30} />
            </span>
            <span className="rsv-option__text">
              <span className="rsv-option__title">{p.centerOption}</span>
              <span className="rsv-option__hint">{p.centerOptionHint}</span>
            </span>
            <ArrowLeft className="rsv-option__go" size={22} aria-hidden="true" />
          </button>
        ) : (
          <div className="rsv-option rsv-option--closed" role="status">
            <span className="rsv-option__icon" aria-hidden="true">
              <Clock3 size={30} />
            </span>
            <span className="rsv-option__text">
              <span className="rsv-option__title">{p.closedTitle}</span>
              <span className="rsv-option__hint">{p.closedBody}</span>
            </span>
          </div>
        )}

        <a href="/register" className="rsv-option rsv-option--online">
          <span className="rsv-option__icon" aria-hidden="true">
            <Laptop size={30} />
          </span>
          <span className="rsv-option__text">
            <span className="rsv-option__title">{p.onlineOption}</span>
            <span className="rsv-option__hint">{p.onlineOptionHint}</span>
          </span>
          <ArrowLeft className="rsv-option__go" size={22} aria-hidden="true" />
        </a>
      </div>
      <p className="rsv-signin">
        <a href="/login">{p.signinCta}</a>
      </p>
    </section>
  );
}

/* ── السنتر ─────────────────────────────────────────────────────────────── */

function CenterPick({
  centers,
  onPick,
  onBack,
}: {
  centers: PublicReservationCenter[];
  onPick: (center: PublicReservationCenter) => void;
  onBack: () => void;
}) {
  return (
    <section aria-labelledby="rsv-centers">
      <h2 id="rsv-centers" className="rsv-section-title">
        {p.centerTitle}
      </h2>
      <div className="rsv-grid">
        {centers.map((center, index) => (
          <div key={center.id} className="rsv-center" data-hue={index % 4}>
            <button type="button" className="rsv-center__main" onClick={() => onPick(center)}>
              <span className="rsv-center__icon" aria-hidden="true">
                <Building2 size={26} />
              </span>
              <span className="rsv-center__text">
                <span className="rsv-center__name">{center.name}</span>
                {center.address ? <span className="rsv-center__address">{center.address}</span> : null}
                <span className="rsv-center__meta">
                  <span className="rsv-center__tag">
                    <CalendarClock size={15} aria-hidden="true" />
                    {formatCopy(p.groupsCount, { n: center.slots.length })}
                  </span>
                  {minPrice(center.slots) !== null ? (
                    <span className="rsv-center__tag">
                      <Wallet size={15} aria-hidden="true" />
                      {formatCopy(p.sessionFrom, { amount: formatEGP(minPrice(center.slots)!) })}
                    </span>
                  ) : null}
                </span>
              </span>
              <ArrowLeft className="rsv-option__go" size={22} aria-hidden="true" />
            </button>
            {center.mapUrl ? (
              <a href={center.mapUrl} target="_blank" rel="noreferrer" className="rsv-center__map">
                <MapPin size={15} aria-hidden="true" />
                {p.openMap}
              </a>
            ) : null}
          </div>
        ))}
      </div>
      <div className="rsv-actions">
        <BackButton onClick={onBack} />
      </div>
    </section>
  );
}

/* ── البيانات ───────────────────────────────────────────────────────────── */

type Errors = Partial<Record<'fullName' | 'phone' | 'grade' | 'track' | 'system' | 'gender' | 'form', string>>;

function minPrice(slots: PublicReservationSlot[]): number | null {
  const prices = slots.map((slot) => slot.priceCents).filter((price): price is number => price !== null && price > 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function Details({
  config,
  center,
  initial,
  onBack,
  onNext,
}: {
  config: ReservationConfig;
  center: PublicReservationCenter;
  initial: Answers | null;
  onBack: () => void;
  onNext: (answers: Answers) => void;
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial ? localNumber(initial.phone) : '');
  const [grade, setGrade] = useState<string | null>(
    initial?.gradeSlug ?? (config.grades.length === 1 ? config.grades[0]!.slug : null),
  );
  const [track, setTrack] = useState<ReservationTrack | null>(initial?.track ?? null);
  const [system, setSystem] = useState<ReservationSystem | null>(initial?.system ?? null);
  const [gender, setGender] = useState<ReservationGender | null>(initial?.gender ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const saving = false;

  function submit() {
    const next: Errors = {};
    const name = fullName.replace(/\s+/g, ' ').trim();
    if (name.length < 5 || name.split(' ').length < 2) next.fullName = p.fullNamePlaceholder;
    const normalized = normalizeEgyptianPhone(phone);
    if (!phone.trim()) next.phone = p.required;
    else if (!normalized) next.phone = copy.subscribe.senderPhoneInvalid;
    if (!grade) next.grade = p.pickOne;
    if (config.askTrack && !track) next.track = p.pickOne;
    if (config.askSystem && !system) next.system = p.pickOne;
    if (config.askGender && !gender) next.gender = p.pickOne;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = Object.keys(next)[0];
      document.getElementById(`rsv-${first}`)?.focus();
      return;
    }
    onNext({
      fullName: name,
      phone: normalized!,
      gradeSlug: grade!,
      track: config.askTrack ? track : null,
      system: config.askSystem ? system : null,
      gender: config.askGender ? gender : null,
    });
  }

  return (
    <form
      method="post"
      className="rsv-card rsv-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="rsv-picked">
        <span className="rsv-picked__icon" aria-hidden="true">
          <Building2 size={20} />
        </span>
        <span className="rsv-picked__name">{center.name}</span>
      </div>

      <h2 className="rsv-section-title rsv-section-title--in">{p.detailsTitle}</h2>

      <CheckoutField id="rsv-fullName" label={p.fullName} error={errors.fullName}>
        <Input
          id="rsv-fullName"
          className="bco-input rsv-input"
          autoComplete="name"
          placeholder={p.fullNamePlaceholder}
          value={fullName}
          maxLength={120}
          invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? 'rsv-fullName-error' : undefined}
          onChange={(event) => setFullName(event.target.value)}
          disabled={saving}
        />
      </CheckoutField>

      <CheckoutField id="rsv-phone" label={p.phone} error={errors.phone} hint={p.phoneHint}>
        <Input
          id="rsv-phone"
          className="bco-input bco-input--ltr rsv-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="01xxxxxxxxx"
          value={phone}
          maxLength={20}
          invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? 'rsv-phone-error' : undefined}
          onChange={(event) => setPhone(event.target.value)}
          disabled={saving}
        />
      </CheckoutField>

      <Choice
        id="rsv-grade"
        label={p.grade}
        icon={<GraduationCap size={18} aria-hidden="true" />}
        error={errors.grade}
        value={grade}
        onChange={setGrade}
        options={config.grades.map((g) => ({ value: g.slug, label: g.label }))}
        disabled={saving}
      />
      {config.askTrack ? (
        <Choice
          id="rsv-track"
          label={p.track}
          error={errors.track}
          value={track}
          onChange={(v) => setTrack(v as ReservationTrack)}
          options={[
            { value: 'arabic', label: p.trackArabic },
            { value: 'languages', label: p.trackLanguages },
          ]}
          disabled={saving}
        />
      ) : null}
      {config.askSystem ? (
        <Choice
          id="rsv-system"
          label={p.system}
          error={errors.system}
          value={system}
          onChange={(v) => setSystem(v as ReservationSystem)}
          options={[
            { value: 'general', label: p.systemGeneral },
            { value: 'azhar', label: p.systemAzhar },
          ]}
          disabled={saving}
        />
      ) : null}
      {config.askGender ? (
        <Choice
          id="rsv-gender"
          label={p.gender}
          error={errors.gender}
          value={gender}
          onChange={(v) => setGender(v as ReservationGender)}
          options={[
            { value: 'male', label: p.genderMale },
            { value: 'female', label: p.genderFemale },
          ]}
          disabled={saving}
        />
      ) : null}

      {errors.form ? (
        <p className="rsv-form-error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {errors.form}
        </p>
      ) : null}

      <div className="rsv-actions rsv-actions--split">
        <BackButton onClick={onBack} disabled={saving} />
        <button type="submit" className="rsv-btn rsv-btn--primary rsv-btn--grow">
          {p.next}
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

/* ── المجموعة ───────────────────────────────────────────────────────────── */

function GroupPick({
  config,
  center,
  answers,
  onBack,
  onOtherCenter,
  onReload,
  onSaved,
}: {
  config: ReservationConfig;
  center: PublicReservationCenter;
  answers: Answers;
  onBack: () => void;
  onOtherCenter: () => void;
  onReload: () => Promise<void>;
  onSaved: (reservation: PublicReservation) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const grade = config.grades.find((g) => g.slug === answers.gradeSlug);
  const slots = center.slots.filter((slot) => slot.year === null || slot.year === grade?.year);

  async function pick(slot: PublicReservationSlot) {
    setSaving(slot.id);
    setError(null);
    try {
      onSaved(
        await apiPost('/api/center-reservations', PublicReservationSchema, {
          centerId: center.id,
          slotId: slot.id,
          ...answers,
        }),
      );
    } catch (failure) {
      const code = errorCode(failure);
      if (code === 'slot_full' || code === 'slot_closed') {
        setError(p.slotFull);
        await onReload();
      } else if (code === 'center_closed' || code === 'reservations_closed') {
        setError(p.centerClosed);
        await onReload();
      } else {
        setError(p.genericError);
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="rsv-card rsv-form" aria-labelledby="rsv-groups">
      <div className="rsv-picked">
        <span className="rsv-picked__icon" aria-hidden="true">
          <Building2 size={20} />
        </span>
        <span className="rsv-picked__name">{center.name}</span>
      </div>
      <h2 id="rsv-groups" className="rsv-section-title rsv-section-title--in">
        {p.groupTitle}
      </h2>
      <p className="rsv-lead">
        {formatCopy(p.groupLead, { grade: grade?.label ?? '', share: shareText(config.payPercent) })}
      </p>

      {slots.length === 0 ? (
        <div className="rsv-empty">
          <p>{p.noGroups}</p>
          <button type="button" className="rsv-btn rsv-btn--ghost" onClick={onOtherCenter}>
            {p.otherCenter}
          </button>
        </div>
      ) : (
        <div className="rsv-slots">
          {slots.map((slot) => (
            <button
              key={slot.id}
              type="button"
              className={cn('rsv-slot', slot.full && 'is-full')}
              disabled={slot.full || saving !== null}
              aria-busy={saving === slot.id}
              onClick={() => void pick(slot)}
            >
              <span className="rsv-slot__when">
                <CalendarClock size={18} aria-hidden="true" />
                <span>
                  {slot.label ? <span className="rsv-slot__label">{slot.label}</span> : null}
                  <span className="rsv-slot__time">{formatSlotTime(slot)}</span>
                </span>
              </span>
              <span className="rsv-slot__price">
                {slot.full ? (
                  <span className="rsv-slot__full">{p.groupFull}</span>
                ) : (
                  <>
                    <span className="rsv-slot__session">
                      {slot.priceCents ? formatCopy(p.sessionPrice, { amount: formatEGP(slot.priceCents) }) : p.noPrice}
                    </span>
                    <span className="rsv-slot__now">
                      {slot.amountCents > 0 ? formatCopy(p.payNow, { amount: formatEGP(slot.amountCents) }) : p.payFree}
                    </span>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {error ? <FormError text={error} /> : null}

      <div className="rsv-actions">
        <BackButton onClick={onBack} disabled={saving !== null} />
      </div>
    </section>
  );
}

/** A two-to-four way question as big tap targets — a radio group, styled. */
function Choice({
  id,
  label,
  icon,
  error,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  icon?: ReactNode;
  error?: string;
  value: string | null;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <fieldset className="rsv-choice" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="bco-field__label rsv-choice__legend">
        {icon}
        {label}
      </legend>
      <div className={cn('rsv-choice__row', options.length > 2 && 'rsv-choice__row--wrap')}>
        {options.map((option, index) => (
          <label key={option.value} className={cn('rsv-pill', value === option.value && 'is-on')}>
            <input
              id={index === 0 ? id : undefined}
              type="radio"
              name={id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} className="bco-field__error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/* ── الدفع ──────────────────────────────────────────────────────────────── */

function Pay({
  reservation,
  payPercent,
  onBack,
  onDone,
}: {
  reservation: PublicReservation;
  payPercent: number;
  onBack: () => void;
  onDone: (reservation: PublicReservation) => void;
}) {
  const [rail, setRail] = useState<ReservationRail | null>(null);
  const [railConfirmed, setRailConfirmed] = useState(false);
  // Empty on purpose: the money often leaves a parent's phone, and a
  // prefilled number is one nobody stops to correct.
  const [senderPhone, setSenderPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ senderPhone?: string; screenshot?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const free = reservation.amountCents === 0;

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const railName = rail === 'vodafoneCash' ? copy.subscribe.railVodafoneCash : copy.subscribe.railInstapay;
  const number = localNumber(rail ? reservation.payment[rail] : null);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setFile(picked);
    setErrors((e) => ({ ...e, screenshot: undefined }));
    setPreviewUrl(picked ? URL.createObjectURL(picked) : null);
  }

  async function confirmFree() {
    setSubmitting(true);
    try {
      onDone(await apiPost(`/api/center-reservations/${reservation.id}/confirm`, PublicReservationSchema));
    } catch {
      setErrors({ form: p.genericError });
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    const next: typeof errors = {};
    const normalized = normalizeEgyptianPhone(senderPhone);
    if (!senderPhone.trim()) next.senderPhone = copy.subscribe.senderPhoneRequired;
    else if (!normalized) next.senderPhone = copy.subscribe.senderPhoneInvalid;
    if (!file) next.screenshot = p.screenshotRequired;
    setErrors(next);
    if (Object.keys(next).length > 0 || !file || !rail) return;

    setSubmitting(true);
    try {
      const uploaded = await uploadReservationScreenshot(file);
      if (!uploaded.ok) {
        setErrors({ screenshot: uploaded.reason === 'tooLarge' ? p.tooLarge : p.uploadFailed });
        return;
      }
      const saved = await apiPost(`/api/center-reservations/${reservation.id}/payment`, PublicReservationSchema, {
        method: rail,
        senderPhone: normalized,
        screenshotKey: uploaded.value.screenshotKey,
      });
      onDone(saved);
    } catch (error) {
      if (codeOf(error) === 'already_submitted') {
        try {
          onDone(await apiGet(`/api/center-reservations/${reservation.id}`, PublicReservationSchema, { cache: 'no-store' }));
          return;
        } catch {
          // fall through to the generic message
        }
      }
      setErrors({ form: p.genericError });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rsv-card rsv-form" aria-labelledby="rsv-pay">
      <div className="rsv-picked">
        <span className="rsv-picked__icon" aria-hidden="true">
          <Building2 size={20} />
        </span>
        <span className="rsv-picked__name">
          {formatCopy(p.reservationFor, { name: reservation.fullName.split(' ')[0] ?? '', center: reservation.centerName })}
          {reservation.slot ? <span className="rsv-picked__sub">{formatSlotTime(reservation.slot)}</span> : null}
        </span>
      </div>
      <h2 id="rsv-pay" className="rsv-section-title rsv-section-title--in">
        {p.payTitle}
      </h2>

      {free ? (
        <>
          <p className="rsv-lead">{p.payFreeLead}</p>
          {errors.form ? <FormError text={errors.form} /> : null}
          <div className="rsv-actions rsv-actions--split">
            <BackButton onClick={onBack} disabled={submitting} />
            <button
              type="button"
              className="rsv-btn rsv-btn--primary rsv-btn--grow"
              onClick={() => void confirmFree()}
              disabled={submitting}
            >
              {submitting ? p.sending : p.confirmFree}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="rsv-lead">
            {formatCopy(p.payLead, { amount: formatEGP(reservation.amountCents), share: shareText(payPercent) })}
          </p>
          <AmountCard
            icon={<Wallet size={22} />}
            label={
              reservation.sessionPriceCents
                ? `${p.amountLabel} · ${formatCopy(p.sessionPrice, { amount: formatEGP(reservation.sessionPriceCents) })}`
                : p.amountLabel
            }
            value={`${formatEGP(reservation.amountCents)} ج`}
            digits={String(Math.round(reservation.amountCents / 100))}
            copyLabel={copy.subscribe.copyAmount}
            copiedLabel={copy.subscribe.copied}
          />

          {!railConfirmed ? (
            <div className="rsv-rail">
              <PaymentMethodChoice
                value={rail}
                onChange={(picked) => {
                  setRail(picked);
                  setRailConfirmed(true);
                }}
                available={{
                  instapay: Boolean(reservation.payment.instapay),
                  vodafoneCash: Boolean(reservation.payment.vodafoneCash),
                }}
              />
            </div>
          ) : (
            <form
              method="post"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <ol className="bco-paysteps">
                <PayStep n={1}>
                  <div className="bco-paystep__head">
                    <p className="bco-paystep__title">{formatCopy(copy.subscribe.payStepSend, { rail: railName })}</p>
                    <button type="button" className="bco-link" onClick={() => setRailConfirmed(false)} disabled={submitting}>
                      {copy.subscribe.railChange}
                    </button>
                  </div>
                  <div className="bco-number">
                    <PaymentBrand rail={rail ?? 'instapay'} className="bco-number__brand" />
                    <bdi dir="ltr" className="bco-number__value">
                      {number}
                    </bdi>
                    <CopyButton text={number} label={copy.subscribe.copyNumber} copiedLabel={copy.subscribe.copied} solid />
                  </div>
                </PayStep>
                <PayStep n={2}>
                  <CheckoutField id="rsv-sender" label={copy.subscribe.senderPhoneLabel} error={errors.senderPhone}>
                    <Input
                      id="rsv-sender"
                      className="bco-input bco-input--ltr rsv-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder="01xxxxxxxxx"
                      value={senderPhone}
                      invalid={Boolean(errors.senderPhone)}
                      aria-describedby={errors.senderPhone ? 'rsv-sender-error' : undefined}
                      onChange={(event) => {
                        setSenderPhone(event.target.value);
                        setErrors((e) => ({ ...e, senderPhone: undefined }));
                      }}
                      disabled={submitting}
                    />
                  </CheckoutField>
                </PayStep>
                <PayStep n={3}>
                  <CheckoutField
                    id="rsv-shot"
                    label={copy.subscribe.screenshotLabel}
                    error={errors.screenshot}
                    hint={formatCopy(copy.subscribe.screenshotHint, { rail: railName })}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={onFile}
                      disabled={submitting}
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <button
                      id="rsv-shot"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={submitting}
                      aria-describedby={errors.screenshot ? 'rsv-shot-error' : undefined}
                      className={cn('bco-upload', previewUrl && 'bco-upload--filled')}
                    >
                      {previewUrl ? (
                        <img src={previewUrl} alt="" className="bco-upload__preview" />
                      ) : (
                        <span className="bco-upload__icon" aria-hidden="true">
                          <ImagePlus size={24} strokeWidth={2} />
                        </span>
                      )}
                      <span className="bco-upload__text">
                        <span className="bco-upload__name">{file ? file.name : copy.subscribe.screenshotPlaceholder}</span>
                        {file ? <span className="bco-upload__change">{copy.subscribe.screenshotChange}</span> : null}
                      </span>
                    </button>
                  </CheckoutField>
                </PayStep>
              </ol>

              {errors.form ? <FormError text={errors.form} /> : null}

              <div className="rsv-actions rsv-actions--split">
                <BackButton onClick={() => setRailConfirmed(false)} disabled={submitting} />
                <button type="submit" className="rsv-btn rsv-btn--primary rsv-btn--grow" disabled={submitting} aria-busy={submitting}>
                  {submitting ? p.sending : p.submit}
                </button>
              </div>
            </form>
          )}
          {!railConfirmed ? (
            <div className="rsv-actions">
              <BackButton onClick={onBack} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ── تم ─────────────────────────────────────────────────────────────────── */

function Done({
  reservation,
  onAgain,
  onNew,
}: {
  reservation: PublicReservation;
  onAgain: () => void;
  onNew: () => void;
}) {
  const rejected = reservation.status === 'rejected';
  const confirmed = reservation.status === 'confirmed';
  const body = rejected
    ? reservation.rejectionReason
      ? formatCopy(p.doneRejected, { reason: reservation.rejectionReason })
      : p.doneRejectedNoReason
    : confirmed
      ? p.doneConfirmed
      : p.doneSubmitted;

  return (
    <section className={cn('rsv-card rsv-done', confirmed && 'is-confirmed', rejected && 'is-rejected')} role="status">
      <span className="rsv-done__icon" aria-hidden="true">
        {rejected ? <CircleAlert size={34} /> : <BadgeCheck size={36} />}
      </span>
      <h2 className="rsv-done__title">{rejected ? p.payTitle : p.doneTitle}</h2>
      <p className="rsv-done__body">{body}</p>
      {rejected ? null : (
        <>
          <p className="rsv-done__number" dir="ltr">
            #{reservation.number}
          </p>
          <p className="rsv-done__center">{reservation.centerName}</p>
          {reservation.slot ? <p className="rsv-done__slot">{formatSlotTime(reservation.slot)}</p> : null}
          <p className="rsv-done__keep">{p.keepNumber}</p>
        </>
      )}
      <div className="rsv-actions rsv-actions--stack">
        {rejected ? (
          <button type="button" className="rsv-btn rsv-btn--primary" onClick={onAgain}>
            {p.sendAgain}
          </button>
        ) : null}
        <a href="/register" className="rsv-btn rsv-btn--online">
          <Laptop size={18} aria-hidden="true" />
          {p.onlineCta}
        </a>
        <button type="button" className="rsv-btn rsv-btn--ghost" onClick={onNew}>
          {p.newReservation}
        </button>
      </div>
      {rejected ? null : <p className="rsv-done__also">{p.alsoOnline}</p>}
    </section>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────────── */

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="rsv-btn rsv-btn--ghost" onClick={onClick} disabled={disabled}>
      <ArrowRight size={18} aria-hidden="true" />
      {p.back}
    </button>
  );
}

function FormError({ text }: { text: string }) {
  return (
    <p className="rsv-form-error" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      {text}
    </p>
  );
}
