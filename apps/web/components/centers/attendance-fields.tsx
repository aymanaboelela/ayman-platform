'use client';

import {
  BookMarked,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  MapPin,
  MonitorPlay,
} from 'lucide-react';
import {
  useController,
  type Control,
  type FieldErrors,
  type UseFormClearErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { formatSlotTime, type CenterView } from '@ayman/contracts/centers';
import type { Onboarding } from '@ayman/contracts/onboarding';
import { copy } from '@ayman/contracts/copy';
import { ChoiceCards, type ChoiceOption } from './choice-cards';
import { seatsLeftLabel, slotPriceLabel } from './center-form';
import './centers.css';

const c = copy.centers;

const STUDY_OPTIONS: ReadonlyArray<ChoiceOption<'general' | 'azhari'>> = [
  { value: 'general', label: c.studyGeneral, hint: c.studyGeneralHint, icon: BookOpen, hue: 5 },
  { value: 'azhari', label: c.studyAzhari, hint: c.studyAzhariHint, icon: BookMarked, hue: 6 },
];

const ATTENDANCE_OPTIONS: ReadonlyArray<ChoiceOption<'online' | 'center'>> = [
  { value: 'online', label: c.attendanceOnline, hint: c.attendanceOnlineHint, icon: MonitorPlay, hue: 2 },
  { value: 'center', label: c.attendanceCenter, hint: c.attendanceCenterHint, icon: Building2, hue: 3 },
];

/** A map link is whatever the admin pasted; only a real web address becomes
 *  an `href`. */
const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

interface FieldsProps {
  control: Control<Onboarding>;
  register: UseFormRegister<Onboarding>;
  clearErrors: UseFormClearErrors<Onboarding>;
  errors: FieldErrors<Onboarding>;
  /**
   * Whether «نوع الحضور» is asked at all: the stack has at least one centre
   * with a slot. False while the list is loading or if it failed — the
   * question stays hidden rather than flashing a half-answerable one.
   */
  attendanceVisible: boolean;
  /** Centres with the slots open to the chosen year (`slotsForYear`). */
  slots: CenterView[];
  /** The slot this student already holds, on «بياناتك». */
  currentSlotId?: string | null;
}

/**
 * «نوع الدراسة», «نوع الحضور» and — under «سنتر» — the weekly slot. Shared by
 * the wizard's third step and «بياناتك», so the two cannot ask differently.
 */
export function StudyAttendanceFields({
  control,
  register,
  clearErrors,
  errors,
  attendanceVisible,
  slots,
  currentSlotId,
}: FieldsProps) {
  return (
    <div className="ctr-scope space-y-5">
      <ChoiceCards
        legend={c.studyType}
        options={STUDY_OPTIONS}
        errorId="study-type-error"
        // Its own Arabic message for the reason `gender` has one: an enum that
        // receives nothing produces zod's English «Invalid option».
        errorMessage={errors.studyType ? c.studyTypeError : undefined}
        registration={register('studyType', { onChange: () => clearErrors('studyType') })}
      />
      {attendanceVisible ? (
        <AttendanceQuestion
          control={control}
          clearErrors={clearErrors}
          errors={errors}
          slots={slots}
          currentSlotId={currentSlotId}
        />
      ) : null}
    </div>
  );
}

function AttendanceQuestion({
  control,
  clearErrors,
  errors,
  slots,
  currentSlotId,
}: Omit<FieldsProps, 'register' | 'attendanceVisible'>) {
  // Controlled, unlike «نوع الدراسة»: this question only exists once the
  // browser has the centre list, so no server markup can disagree with it,
  // and the slot list below has to re-render on the answer.
  const mode = useController({ control, name: 'attendanceMode' });

  return (
    <>
      <ChoiceCards
        legend={c.attendance}
        options={ATTENDANCE_OPTIONS}
        errorId="attendance-error"
        errorMessage={errors.attendanceMode ? c.attendanceError : undefined}
        name={mode.field.name}
        value={mode.field.value}
        onChange={(value) => {
          mode.field.onChange(value);
          clearErrors(['attendanceMode', 'centerSlotId']);
        }}
      />
      {mode.field.value === 'center' ? (
        <SlotPicker
          control={control}
          clearErrors={clearErrors}
          slots={slots}
          currentSlotId={currentSlotId}
          // A refusal from the server carries its own sentence («اتملى»);
          // anything else here means «nothing picked».
          errorMessage={
            errors.centerSlotId
              ? errors.centerSlotId.type === 'server'
                ? errors.centerSlotId.message
                : c.slotError
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function SlotPicker({
  control,
  clearErrors,
  slots,
  currentSlotId,
  errorMessage,
}: {
  control: Control<Onboarding>;
  clearErrors: UseFormClearErrors<Onboarding>;
  slots: CenterView[];
  currentSlotId?: string | null;
  errorMessage?: string;
}) {
  const { field } = useController({ control, name: 'centerSlotId' });

  if (slots.length === 0) {
    return <p className="ctr-slots__empty">{c.slotsEmpty}</p>;
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby="ctr-slots-title"
      aria-describedby={errorMessage ? 'ctr-slots-error' : 'ctr-slots-hint'}
      className="ctr-slots"
    >
      <div className="ctr-slots__head">
        <span className="ctr-slots__badge" aria-hidden="true">
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0">
          <p id="ctr-slots-title" className="ctr-slots__title">
            {c.slotsTitle}
          </p>
          <p id="ctr-slots-hint" className="ctr-slots__hint">
            {c.slotsHint}
          </p>
        </div>
      </div>

      {slots.map((center) => (
        <section key={center.id} className="ctr-center" aria-label={center.name}>
          <header className="ctr-center__head">
            <span className="ctr-center__icon" aria-hidden="true">
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="ctr-center__name">{center.name}</p>
              {center.address ? (
                <p className="ctr-center__address">
                  <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                  <span>{center.address}</span>
                </p>
              ) : null}
            </div>
            {center.mapUrl && isWebUrl(center.mapUrl) ? (
              <a
                href={center.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ctr-center__map"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
                {c.mapLink}
              </a>
            ) : null}
          </header>

          <div className="ctr-center__slots">
            {center.slots.map((slot) => {
              // The seat this student already holds stays pickable when the
              // slot is «فل» — the full seat is theirs, and the API keeps a
              // booking it is handed back unchanged.
              const mine = slot.id === currentSlotId;
              const closed = slot.full && !mine;
              return (
                <label key={slot.id} className="ctr-slot" data-closed={closed || undefined}>
                  <input
                    type="radio"
                    name={field.name}
                    value={slot.id}
                    className="sr-only"
                    checked={field.value === slot.id}
                    disabled={closed}
                    aria-invalid={errorMessage ? true : undefined}
                    onChange={() => {
                      field.onChange(slot.id);
                      clearErrors('centerSlotId');
                    }}
                  />
                  <span className="ctr-slot__icon" aria-hidden="true">
                    <Clock className="size-4" />
                  </span>
                  <span className="ctr-slot__body">
                    <span className="ctr-slot__time">{formatSlotTime(slot)}</span>
                    <span className="ctr-slot__chips">
                      {slot.label ? (
                        <span className="ctr-chip" data-tone="label">
                          {slot.label}
                        </span>
                      ) : null}
                      {slot.priceCents !== null ? (
                        <span className="ctr-chip" data-tone="price">
                          {slotPriceLabel(slot.priceCents)}
                        </span>
                      ) : null}
                      {mine ? (
                        <span className="ctr-chip" data-tone="mine">
                          {c.slotCurrent}
                        </span>
                      ) : null}
                      {slot.full ? (
                        <span className="ctr-chip" data-tone="full">
                          {c.slotFull}
                        </span>
                      ) : slot.seatsLeft !== null ? (
                        <span className="ctr-chip" data-tone="seats">
                          {seatsLeftLabel(slot.seatsLeft)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="ctr-slot__tick" aria-hidden="true">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ))}

      {errorMessage ? (
        <p id="ctr-slots-error" role="alert" className="field__error">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
