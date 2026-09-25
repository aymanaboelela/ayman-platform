'use client';

import { startTransition, useActionState } from 'react';
import type { AdminStudentDetail } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { patchStudentAction, type ActionResult } from '../actions';
import { GovernorateCityFields } from './governorate-city-fields';
import { useFeature } from '@/components/admin/entitlements-context';

const IDLE: ActionResult = { ok: true };

function ActionError({ state }: { state: ActionResult }) {
  if (state.ok) return null;
  return (
    <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
      {state.message}
    </p>
  );
}

export function StudentDetailForm({
  student,
  governorateOptions,
}: {
  student: AdminStudentDetail;
  governorateOptions: { value: string; label: string }[];
}) {
  const honorBoardOpen = useFeature('honorBoard');
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    (_previous, formData) => patchStudentAction(student.id, formData),
    IDLE,
  );

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">
            {copy.admin.students.profileSection}
          </h2>
          <Badge tone={student.onboardingCompleted ? 'accent' : 'neutral'}>
            {student.onboardingCompleted
              ? copy.admin.students.onboardingDone
              : copy.admin.students.onboardingPending}
          </Badge>
        </div>

        <dl className="grid grid-cols-1 gap-2 text-[length:var(--fs-text-sm)] sm:grid-cols-2">
          {/* «ID» — the short number the centre's card carries (QR and
              barcode). Read-only: it is issued once and printed. */}
          <div>
            <dt className="text-fg-muted">{copy.admin.centers.student.studentNumber}</dt>
            <dd
              dir="ltr"
              className="font-mono text-[length:var(--fs-title-4)] font-semibold tabular-nums text-fg [unicode-bidi:isolate] text-end"
            >
              {student.studentNumber}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{copy.admin.students.memberSince}</dt>
            <dd className="text-fg">{new Date(student.createdAt).toLocaleDateString('ar-EG')}</dd>
          </div>
          {/*
            The parent numbers get their own buttons, each LABELLED with whose
            it is. Three identical green buttons under three different numbers
            is a way to send a parent a message meant for their child.

            These are free text — `student_profiles.father_phone` is whatever
            was typed at onboarding — so `WhatsappButton` normalises before it
            decides whether to render at all; a number nobody can parse simply
            shows as text with no button beside it.
          */}
          {student.fatherPhone ? (
            <div>
              <dt className="text-fg-muted">{copy.admin.students.fatherPhone}</dt>
              <dd className="flex flex-wrap items-center gap-2 text-fg">
                {student.fatherPhone}
                <WhatsappButton
                  phone={student.fatherPhone}
                  label={copy.admin.students.whatsappFather}
                  size="sm"
                />
              </dd>
            </div>
          ) : null}
          {student.motherPhone ? (
            <div>
              <dt className="text-fg-muted">{copy.admin.students.motherPhone}</dt>
              <dd className="flex flex-wrap items-center gap-2 text-fg">
                {student.motherPhone}
                <WhatsappButton
                  phone={student.motherPhone}
                  label={copy.admin.students.whatsappMother}
                  size="sm"
                />
              </dd>
            </div>
          ) : null}
          {student.electiveSubjectNameAr ? (
            <div>
              <dt className="text-fg-muted">{copy.admin.students.electiveSubject}</dt>
              <dd className="text-fg">{student.electiveSubjectNameAr}</dd>
            </div>
          ) : null}
        </dl>

        {/*
          `onSubmit` + `startTransition`, NOT `action={action}`.

          React 19 calls `form.reset()` when a form ACTION settles. The
          governorate and city are controlled selects (the city's options are
          the governorate's value — see `GovernorateCityFields`), and a
          controlled select has no `selected` attribute for a native reset to
          restore: after every save both snapped to their first option while
          React state held the real ones, and the NEXT save — any save, even of
          the phone — silently moved the student to the first governorate and
          erased the city. `lesson-settings-form.tsx` documents the same bug.

          Dispatching from `onSubmit` never enters the form-action path, so
          there is no reset; the uncontrolled inputs keep what was just saved,
          which is also what the row now holds. `method="post"` for the window
          before hydration, where a bare form would submit as GET and put a
          phone number in the URL.
        */}
        <form
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(() => action(formData));
          }}
          className="max-w-[var(--w-prose)] space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fullName">{copy.admin.students.fullName}</Label>
              <Input id="fullName" name="fullName" defaultValue={student.fullName} required />
            </div>
            {/*
              The account's real login identity — see `User.phoneNumber`. Not
              nullable, and `required` here for the same reason `fullName` is:
              every account keeps a number. `egyptianPhone` on the server
              re-parses whatever is typed, so `01012345678` and
              `+201012345678` both land on the exact E.164 string the sign-in
              lookup matches by exact string equality — the admin does not
              have to type it pre-formatted.
            */}
            <div>
              <Label htmlFor="phone">{copy.admin.students.columnPhone}</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                dir="ltr"
                inputMode="numeric"
                placeholder={copy.auth.fields.phonePlaceholder}
                defaultValue={student.phone}
                required
              />
            </div>
            {/* Nullable, matching the column: clearing this field back to
                empty sends `null` and the row goes back to «مادّاش إيميل». */}
            <div>
              <Label htmlFor="email">{copy.admin.students.columnEmail}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                dir="ltr"
                defaultValue={student.email ?? ''}
              />
            </div>
            <div>
              <Label htmlFor="schoolName">{copy.admin.students.schoolName}</Label>
              <Input id="schoolName" name="schoolName" defaultValue={student.schoolName ?? ''} />
            </div>
            <GovernorateCityFields
              defaultGovernorateCode={student.governorateCode}
              defaultCityId={student.cityId}
              governorateOptions={governorateOptions}
            />
            <div>
              <Label htmlFor="year">{copy.admin.students.columnYear}</Label>
              <Select id="year" name="year" defaultValue={student.year ?? ''}>
                <option value="">—</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </Select>
            </div>
            {/* Nullable — «مش متسجّل» is a real, distinct answer from either
                stream, not an empty selection; see `AdminStudentDetailSchema`'s
                own note on why a missing value is shown rather than guessed. */}
            <div>
              <Label htmlFor="schoolStream">{copy.admin.students.schoolStream}</Label>
              <Select id="schoolStream" name="schoolStream" defaultValue={student.schoolStream ?? ''}>
                <option value="">{copy.admin.students.schoolStreamUnknown}</option>
                <option value="general">{copy.stream.general}</option>
                <option value="languages">{copy.stream.languages}</option>
              </Select>
            </div>
            {/* «نوع الدراسة» / «نوع الحضور» — nullable like the stream above:
                a student onboarded before the questions existed is «مش
                متسجّل», not a guess. */}
            <div>
              <Label htmlFor="studyType">{copy.admin.centers.student.studyType}</Label>
              <Select id="studyType" name="studyType" defaultValue={student.studyType ?? ''}>
                <option value="">{copy.admin.centers.student.unknown}</option>
                <option value="general">{copy.admin.centers.student.studyTypes.general}</option>
                <option value="azhari">{copy.admin.centers.student.studyTypes.azhari}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="attendanceMode">{copy.admin.centers.student.attendanceMode}</Label>
              <Select
                id="attendanceMode"
                name="attendanceMode"
                defaultValue={student.attendanceMode ?? ''}
                aria-describedby="attendanceMode-hint"
              >
                <option value="">{copy.admin.centers.student.unknown}</option>
                <option value="online">{copy.admin.centers.student.attendanceModes.online}</option>
                <option value="center">{copy.admin.centers.student.attendanceModes.center}</option>
              </Select>
              <p id="attendanceMode-hint" className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                {copy.admin.centers.student.attendanceModeHint}
              </p>
            </div>
          </div>

          {/*
            صورة لوحة الشرف — inside this form and not beside it, so it saves
            with «حفظ» like every other field on the row and there is no second
            control that writes on its own.

            Round, because that is how the board draws it: a 16/9 crop approved
            here and then clipped to a circle there is how a winner's face ends
            up half outside the disc. `shape="round"` crops square and previews
            as a disc — what he approves is what the page shows.
          */}
          {/* صورة الفايز — ومالهاش أي مكان تتعرض فيه على ستاك اللوحة مقفولة
              فيه. الحقل بيختفي، والقيمة المحفوظة بتفضل في الصف زي ما هي
              عشان تشتغل تاني لو الفيتشر اتفتحت. */}
          {honorBoardOpen ? (
            <MediaKeyField
              name="honorPhotoKey"
              id="honorPhotoKey"
              label={copy.admin.students.honorPhoto}
              hint={copy.admin.students.honorPhotoHint}
              defaultValue={student.honorPhotoKey}
              shape="round"
            />
          ) : null}

          <ActionError state={state} />

          <Button type="submit" disabled={pending}>
            {pending ? copy.admin.actions.saving : copy.admin.actions.save}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
