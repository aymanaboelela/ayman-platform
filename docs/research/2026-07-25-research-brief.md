# منصة أيمن — Research Brief & Build Decisions
**Version 1.0 · 2026-07-25 · Single source of truth for the build**

---

## 0. Read this first: three places the founder's brief diverges from reality

| Brief says | Reality | Decision |
|---|---|---|
| "بكالوريا أولى / بكالوريا تانية" | The Ministry uses **الصف الأول الثانوي / الصف الثاني الثانوي / الصف الثالث الثانوي** for both systems. Sada El-Balad explicitly notes the ministry does *not* say "سنة أولى بكالوريا". | Year dropdown uses the official three grade names. Add a badge (`تمهيدي` / `سنة شهادة`) driven by the selected system. |
| Onboarding = governorate + year | Every Egyptian competitor collects **4 name parts, student phone, father's phone, mother's phone, school, parent occupation, governorate, gender, year, شعبة/مسار** — 16 fields — because the parent portal and offline reconciliation depend on it. | Ship a **9-field** onboarding (§1.6). Two parent phones are the highest-ROI field on the list; they unlock the parent dashboard, which is the single strongest retention lever in this market. |
| Email + password + Google + Apple | The Egyptian baseline is **phone number as the identity**, password, then SMS OTP. Bassthalk's login endpoint takes `{phone:int, password}`. Students do not reliably have or check email. | Keep email/password/Google/Apple as the *account* layer (Better Auth), but make **phone a required, unique, verified field** captured at onboarding. Ship SMS OTP as a v1.1 flag, not v1 — but reserve the schema now. |

Also: **as of the 2026/2027 intake there are no grade-3 بكالوريا students.** The first cohort reaches الصف الثاني in 2026/2027 and sits the first-ever بكالوريا exams in **June 2027**. Grade-3 بكالوريا content is not needed until 2027/2028. Grade-3 **ثانوية عامة** content is needed immediately.

---

## 1. How Egyptian platforms actually work

Benchmarked primarily against **منصة بسطتهالك (bassthalk.com)** — reverse-engineered from its shipped production React bundle, not marketing copy — plus Nova Class, Prime E, Saabeel, VCLASSES, Al-Shater Academy, Nqish, Acwad, Abwaab, Elkheta, Nagwa, and حصص مصر.

> ⚠️ There is **no** Egyptian education platform at `basata.online` — that domain is an unrelated English "Launching Soon" holding page. Do not confuse بسطتهالك (bassthalk.com) with بسطنهالك (basstnhalk.com), بسطها (basatha.com), or بسّط (bassat.online). If the founder named a specific reference site, confirm which one.

### 1.1 The feature baseline we must match

These are table stakes. Shipping without them reads as below-market to any Egyptian teacher or parent.

| # | Mechanic | What competitors do | Our v1 posture |
|---|---|---|---|
| 1 | **Phone-first identity** | Login is `phone + password`, never email. OTP on login. `visitor_visit_id` device fingerprint on every auth call. 90-second resend cooldown. | Email/OAuth for account, phone required + unique. Fingerprint from day one. |
| 2 | **Rich onboarding** | 16 fields incl. both parents' phones, school, parent occupation, gender, dependent شعبة dropdown filtered by year. | 9 fields (§1.6). Dependent dropdowns mandatory. |
| 3 | **Polymorphic content model** | `Sellable(course) → Section → Sectionable` where `sectionable_type ∈ {video, book, exam}`, exam sub-typed `{exam, hm, evaluation_exam}`. **Not** كورس→شهر→حصة. "شهر" is a *pricing* concept, not a content level. | Identical: `courses → sections → lessons(kind)`. |
| 4 | **Per-item access config** | On each content item: `visible_from`, `visible_to`, `group_name`, `is_locked_on` (prerequisite gating), `exam_open_limit`, `view_limit`. Content groups shared across courses. | Ship `availability jsonb` + `unlocks_after_lesson_id` in v1. **Cheap now, brutal to retrofit.** |
| 5 | **Pluggable video provider** | Seven providers per video: `upload, youtube, vimeo, ink (Inkrypt), vdocipher, bunny, gumlet`. Premium content gets real DRM (server-minted short-lived OTP); cheap content gets YouTube iframes. | Model the field as `{provider, external_id, otp?}` from day one even though v1 is YouTube-only. Tier cost against piracy risk per item later. |
| 6 | **Per-student view quotas** | HTTP **439** when exceeded → `"تم تخطي عدد مرات المشاهدة لهذا الفديو يرجى التواصل مع الدعم"`. Admin can grant more via `increase_custom_user_video_limit`. Watch telemetry posted on an interval: `total_time_played`, `duration`, `video_opened_count`, `video_watched_percentage`. | Ship the telemetry and the counter in v1; leave enforcement **off** behind a flag. **If you ever turn it on, ship the admin "grant more views" button in the same release.** |
| 7 | **Single active session** | Any 401 → forced logout with: `"تم انتهاء صلاحية تسجيل دخولك — في حد دخل على حسابك من جهاز تاني…"` plus a support hotline in the dialog. Admin sees a session table and can force-logout. | Ship the session table + admin force-logout in v1. Enforcement of single-active-session behind a flag. |
| 8 | **Dynamic watermarking** | Universal across vendors: student's **name/phone/ID burned into the video overlay**, plus (VCLASSES) automated voice announcements of the student ID inserted into the audio. | Highest-leverage anti-piracy move. Convert an unpreventable problem into an **attributable** one. Overlay the student's phone number at random positions on a 20s cycle over the player. Works even with YouTube iframes (absolutely-positioned overlay). |
| 9 | **Auto-graded exams, instant results** | MCQ bubble sheet + essay. Config: `duration`, `exam_open_limit` (0=unlimited), success grade, `shuffle_questions/answers/partitions`, question banks with partitions, retry cooldown default **24h**. Essay auto-grading via keyword model answers + weighted نقاط التصحيح, with admin review and a **grade-appeal flow** (`الدرجة قبل/بعد التظلم`). | Match all of it except essay auto-grading (v1.1). Ship the appeal flow — it is a trust signal parents notice. |
| 10 | **Full correct/incorrect review** | Immediate `الإجابة الصحيحة` / `إجابة نموذجية` reveal, per-question explanation, تصنيف breakdown, score-band motivational copy, stats (`اعلى/اقل نتيجة`, `متوسط نتائجك`, `عدد مرات انهائك`). | Match, and add the **personalized retry** (regenerate a quiz from the student's own past wrong answers) — بسطتهالك has it and it is a genuine differentiator. |
| 11 | **Parent dashboard** | `/parent_dashboard` showing نجلك's views and grades, with weekly follow-up messages (`is_to_send_parent_follow_up_message`). This is *why* signup collects both parents' phones. | v1.1, but collect the phones in v1. |
| 12 | **No public leaderboards** | Deliberately absent — culturally sensitive with parents. Replaced with a **spin-the-wheel prize draw** (`get_lucky_users` / `select_the_winner`) and parent reporting. | Copy the posture. No public ranking of students. Private "your percentile" only. |
| 13 | **Offline access codes** | The defining commercial mechanic. Three semantically different code types: `center_to_migrate` (bound to account for the year), `insert_auto_code` (the code *is* an account), `subscription_migration` (pure wallet top-up). 15-digit center cards, batch generation with serial ranges, per-code price + commission, Excel import, per-outlet tracking, and a `/store_locator` mapping منافذ بيع by governorate. | **Out of scope for v1** (founder says free/local). But the entitlement model must be a *grant object*, not a boolean `has_course` — see §5. |
| 14 | **Wallet-first payments** | Internal wallet → Fawaterk / Shake-out aggregators → **Fawry cash reference** (`"توجه نحو اقرب فرع خدمة لفوري و اطلب الدفع على خدمة رقم ٧٨٨"`). Card-only checkout would exclude most students. Closed-loop wallet, no cash refunds, 24h cancellation window refunded to wallet only. | Out of scope v1. When it lands: aggregator, not direct Fawry integration. Wallet as settlement layer. |
| 15 | **Everything admin-configurable** | Drag-reorder of أقسام→وحدات→دروس, content groups, per-student overrides, exemption/scholarship categories (`orphans` منحة الأيتام, `financial` غير مقتدر, `twinz` توأم), coupons with max-discount caps, IP blocklists, login-attempt logs. | Match. The founder's "EVERY single thing configurable" is the market norm, not a stretch goal. |

### 1.2 What they do badly — our openings

1. **Signup is a human-approved queue.** بسطتهالك's `POST api/auth/account_creation_request` returns *"تم إنشاء حسابك و سيتم مراجعته… تقدر تسجل دخول خلال ساعات قليلة"*. Hours of friction before a student can look at anything. → **We ship instant self-serve access with a free-preview tier**, and use device fingerprint + phone verification as the anti-fraud compensating control instead of a human queue.

2. **The one-attempt exam trap.** *"محاولة تسليم الامتحان مرة واحد فقط .. ولو دوست تسليم من غير ما تحل الامتحان؛ للأسف باقي المحاضرة مش هتظهر لك ولازم تتواصل ساعتها مع الدعم"*. Every warning modal in their bundle points at الدعم. This is the single biggest support-ticket generator visible in their code. → **We default to practice mode (unlimited, instant feedback) + a separate graded mode**, ship a confirm-before-submit with an unanswered-questions count, and build the admin unlock button *before* launch, not after.

3. **Session kicks with no self-service.** The kick dialog literally hands out a phone number (16546). Legitimate multi-device students (school tablet + home laptop + phone) hit it constantly. → **Two concurrent sessions allowed, a visible "my devices" page with self-service revoke, and a 3-per-month self-reset quota** before support is involved.

4. **Nobody handles the new البكالوريا taxonomy properly.** Existing platforms still model شعب علمي/أدبي. The four مسارات, the grade-2 elective *pairs*, the 70% pass line, the 600-mark denominator, and the retake/تحسين model (best-score-wins, up to 4 improvements) are all unbuilt. → **This is the actual wedge.** A student who can see "you're at 412/600, you need 70% in الكيمياء to pass" has something no competitor offers.

5. **No retake/التحسين modeling.** A student can simultaneously be "studying grade 3" and "retaking a grade-2 subject". A naive one-row-per-subject progress schema breaks on this. → We model attempts-per-subject with best-score-wins from the start, which unlocks a whole retention product (كورسات التحسين).

6. **Aesthetics.** Every platform in this market is a CRA SPA with bootstrap-era chrome, no dark mode, no motion discipline, and Latin-first typography with Arabic bolted on. Google Play rating for بسطتهالك is **3.45★ across ~7.1k ratings**. → Design is a genuine, defensible differentiator here in a way it isn't in most markets.

7. **Anti-tampering is theater.** The bassthalk web bundle contains **zero** root/emulator detection (the only `is_emulator` reference is hard-coded `false` inside the bundled Sentry SDK). Screen-recording blocking is claimed universally and is technically unenforceable on desktop browsers. → Don't build theater. Build watermarking, which actually works.

### 1.3 Content hierarchy — the model to copy

```
Course (سيلابل / كورس)
 └── Section (قسم / وحدة)        ordered, drip-schedulable
      └── Lesson (درس)           kind ∈ {video, quiz, attachment, text}
           ├── lesson_videos      1:1
           ├── lesson_attachments 1:N
           └── quizzes            1:1
```
"شهر" / "الترم" / "الباقة" are **pricing packages**, never content levels. Reordering is `position int` + tie-break on `id` — never a CSV `sequence` column (Moodle's known wart) and never index-based keys.

### 1.4 Access model

Entitlement is a **grant object**, never a boolean. بسطتهالك's grant carries `{phone, unassigned_subscription, course_id, subscription_type, platform_subscription, permanent, valid_from, valid_to, year}` plus `is_prepaid`. The `unassigned_subscription` ("floating credit the student later assigns to any course") is what makes prepaid scratch cards work without knowing what the buyer wants. Copy the shape even while everything is free.

### 1.5 Quiz behaviour baseline

- Two modes: **practice** (unlimited attempts, instant per-question feedback, review always on) and **graded** (attempt limit, timer, review gated by a time-window matrix).
- Timer authority is **server-side**: `deadline_at` computed and persisted at attempt start. Never recompute from settings — an instructor editing the time limit must not break in-flight attempts.
- Question and option order resolved **once** at attempt creation and persisted. Otherwise resume-after-disconnect reshuffles the paper.
- Overdue handling: three modes (`autosubmit` / `graceperiod` / `autoabandon`). Default **autosubmit** with a 60s grace.
- Review matrix: four time windows × seven visibility flags (§5). Default: `during` = nothing, `immediately_after` = everything.
- Retry cooldown default 24h, configurable, 0 = none.

### 1.6 Onboarding checklist — our decision (9 fields, one screen, three steps)

```
Step 1 — من إنت
  full_name          (single field, not four — we're not doing center reconciliation)
  gender             ذكر | أنثى
  phone              رقم الهاتف          [required, unique, E.164 +20…]

Step 2 — مكانك
  governorate_code   اختر محافظتك        [27 options, seeded §2.5]
  school_name        اسم المدرسة          [optional, free text + autocomplete]

Step 3 — دراستك
  system             النظام الدراسي       ثانوية عامة | البكالوريا المصرية
  year               الصف الدراسي         [3 options, labels per §2.1]
  track              المسار / الشعبة      [conditional — see below]
  elective_subject   المادة الاختيارية    [conditional — grade 2 بكالوريا only]

Optional (skippable, prompted again at day 7)
  father_phone       رقم هاتف الأب
  mother_phone       رقم هاتف الأم
```

**Conditional logic (non-negotiable):**
- `track` is **hidden and null** when `year = 1` — grade 1 is a common, non-specialized year identical across both systems. Track selection happens *before* the start of الصف الثاني الثانوي.
- When `system = ثانوية عامة`, `track` options are the three شعب: `علمي علوم`, `علمي رياضة`, `أدبي`.
- When `system = البكالوريا المصرية`, `track` options are the **four** مسارات (§2.2).
- `elective_subject` appears only when `system = بكالوريا AND year = 2`, and its two options depend on `track` (§2.3).
- Model `system` and `track` as **nullable** — a grade-1 student legitimately hasn't decided yet, and the ministry expects the ~90% بكالوريا opt-in to be measured at grade 2. Re-prompt at promotion.

---

## 2. البكالوريا system facts — database-ready

### 2.1 Systems and years

| system slug | Arabic label | Years | Total marks | Pass threshold | Attempts |
|---|---|---|---|---|---|
| `thanaweya_amma` | الثانوية العامة | 1, 2, 3 | **320** (grade 3 only) | **50%** | Single decisive attempt |
| `bacalorya` | البكالوريا المصرية | 1, 2, 3 | **600** (400 from grade 2 + 200 from grade 3) | **70%** | دور أول/دور ثاني; grade-2 subjects improvable up to **4×** across two years, grade-3 subjects **2×** in-year, 5-year window, **highest score counts** |

Year labels (identical for both systems — the Ministry does not use "بكالوريا أولى"):

| year | label | بكالوريا badge | ثانوية عامة badge |
|---|---|---|---|
| 1 | `الصف الأول الثانوي` | مرحلة تمهيدية | سنة نقل |
| 2 | `الصف الثاني الثانوي` | **سنة شهادة** (67% of the total) | سنة نقل |
| 3 | `الصف الثالث الثانوي` | سنة شهادة | سنة شهادة |

> **Content roadmap consequence:** grade-2 بكالوريا carries **~67%** of the final mark and is the first certificate year. Prioritize it above grade 3 — the opposite of the old ثانوية عامة instinct. And there are **no grade-3 بكالوريا students until 2027/2028**.

### 2.2 The four tracks (المسارات) — exactly four, not five

| slug | canonical Arabic | aliases seen in press | selected at |
|---|---|---|---|
| `medicine_life_sciences` | **مسار الطب وعلوم الحياة** | الطب والعلوم الحيوية | start of grade 2 |
| `engineering_cs` | **مسار الهندسة وعلوم الحاسب** | مسار الهندسة والحاسبات، العلوم الهندسية والتكنولوجيا | start of grade 2 |
| `business` | **مسار الأعمال** | قطاع الأعمال، إدارة الأعمال | start of grade 2 |
| `arts_humanities` | **مسار الآداب والفنون** | الآداب والعلوم الإنسانية | start of grade 2 |

There is **no** separate "الفنون والتصميم" or "الطب والصحة" track. Store a canonical `label_ar` plus an `aliases text[]` column for search — outlets vary wildly.

**Track → faculty mapping** (ship as an onboarding reverse-funnel: *"اختار كليتك، نقولك مسارك"*):

- **الطب وعلوم الحياة** → الطب البشري، طب الأسنان، الصيدلة، العلاج الطبيعي، التمريض، الطب البيطري، العلوم، الزراعة، الثروة السمكية
- **الهندسة وعلوم الحاسب** → الهندسة، الحاسبات والمعلومات، الذكاء الاصطناعي، الاتصالات والإلكترونيات، التخطيط العمراني
- **الأعمال** → التجارة، إدارة الأعمال، المحاسبة، التسويق، التمويل، نظم المعلومات الإدارية، الاقتصاد، اللوجستيات
- **الآداب والفنون** → الألسن، الآداب، الإعلام، الحقوق، الآثار، السياحة والفنادق، الفنون الجميلة، الخدمة الاجتماعية، دار العلوم، التربية النوعية

### 2.3 Subjects

**الصف الأول الثانوي** — common to both systems.

| subject | counts_toward_total | notes |
|---|---|---|
| اللغة العربية | ✅ | |
| اللغة الأجنبية الأولى | ✅ | |
| التاريخ المصري | ✅ | |
| الرياضيات | ✅ | |
| العلوم المتكاملة | ✅ | |
| الفلسفة والمنطق | ✅ | |
| التربية الدينية | ❌ | نجاح/رسوب, **70% to pass**, every year, every track |
| اللغة الأجنبية الثانية | ❌ | becomes **graded** in the الآداب والفنون track at grade 2 |
| البرمجة وعلوم الحاسب | ❌ | becomes **graded** in the الهندسة track at grade 2 |
| التربية الرياضية | ❌ | *unconfirmed — only one source lists it. See §7* |

**الصف الثاني الثانوي — البكالوريا** = **4 subjects** (3 shared + 1 elective).

Shared: `اللغة العربية`, `اللغة الأجنبية الأولى`, `التاريخ المصري`.

| track | elective pair (choose exactly 1) |
|---|---|
| الطب وعلوم الحياة | **الرياضيات** أو **الفيزياء** |
| الهندسة وعلوم الحاسب | **الكيمياء** أو **البرمجة** |
| الأعمال | **المحاسبة** أو **إدارة الأعمال** |
| الآداب والفنون | **علم النفس** أو **اللغة الأجنبية الثانية** |

**الصف الثالث الثانوي — البكالوريا** = **2 graded specialist subjects** + التربية الدينية (70%, excluded from total).

| track | subject 1 | subject 2 |
|---|---|---|
| الطب وعلوم الحياة | **الأحياء** (مستوى رفيع) | **الكيمياء** (مستوى رفيع) |
| الهندسة وعلوم الحاسب | **الرياضيات** (مستوى رفيع) | **الفيزياء** (مستوى رفيع) |
| الأعمال | **الاقتصاد** (مستوى رفيع) | **الرياضيات** |
| الآداب والفنون | **الجغرافيا** (مستوى رفيع) | **الإحصاء** |

> `مستوى رفيع` vs `مستوى عادي` is a **depth** attribute, not a marks attribute — both are 100 marks. Store `level` on the *subject-per-track-per-year* row, not on the subject.
>
> **الرياضيات appears in three different roles** (grade-1 core, grade-2 elective for medicine, grade-3 subject for engineering *and* business). Subject entities **must** be scoped by `(system, year, track)` — never global.

**الثانوية العامة** keeps its three classic شعب: `علمي علوم`, `علمي رياضة`, `أدبي`. Running **in parallel**, not replaced — *"نظام موازٍ للثانوية العامة وليس بديلاً لها"*. Both exams are held simultaneously for the first time in **June 2027**. Ministry projects ~90% of grade-2 students choose البكالوريا, but you cannot drop ثانوية عامة content.

### 2.4 Retakes / التحسين

- Two sittings per year (دور أول / دور ثاني).
- Grade-2 subjects improvable up to **4 times** across the two years; grade-3 subjects **twice** in the same year.
- 5-year window. **Highest score counts.**
- First sitting free; retake fee announced at 500 EGP/exam, later reported reduced to **200 EGP/subject** (effective date unconfirmed).

Schema consequence: **`subject_attempts` is a separate table with `attempt_no` and best-score-wins aggregation.** A student can be "studying grade 3" and "retaking a grade-2 subject" simultaneously.

### 2.5 The 27 governorates — verbatim, seed-ready

Ordered by the official national-ID governorate code (the order Egyptian government forms use). Codes are gap-numbered and encode region. **Do not sort alphabetically.** Pin القاهرة، الجيزة، الإسكندرية to the top of the dropdown for UX, then render the rest in code order.

```sql
INSERT INTO governorates (code, name_ar, slug, region) VALUES
('01','القاهرة',        'cairo',          'urban'),
('02','الإسكندرية',     'alexandria',     'urban'),
('03','بورسعيد',        'port_said',      'urban'),
('04','السويس',         'suez',           'urban'),
('11','دمياط',          'damietta',       'lower'),
('12','الدقهلية',       'dakahlia',       'lower'),
('13','الشرقية',        'sharqia',        'lower'),
('14','القليوبية',      'qalyubia',       'lower'),
('15','كفر الشيخ',      'kafr_el_sheikh', 'lower'),
('16','الغربية',        'gharbia',        'lower'),
('17','المنوفية',       'monufia',        'lower'),
('18','البحيرة',        'beheira',        'lower'),
('19','الإسماعيلية',    'ismailia',       'lower'),
('21','الجيزة',         'giza',           'upper'),
('22','بني سويف',       'beni_suef',      'upper'),
('23','الفيوم',         'faiyum',         'upper'),
('24','المنيا',         'minya',          'upper'),
('25','أسيوط',          'asyut',          'upper'),
('26','سوهاج',          'sohag',          'upper'),
('27','قنا',            'qena',           'upper'),
('28','أسوان',          'aswan',          'upper'),
('29','الأقصر',         'luxor',          'upper'),
('31','البحر الأحمر',   'red_sea',        'frontier'),
('32','الوادي الجديد',  'new_valley',     'frontier'),
('33','مطروح',          'matrouh',        'frontier'),
('34','شمال سيناء',     'north_sinai',    'frontier'),
('35','جنوب سيناء',     'south_sinai',    'frontier');
```

Region groups: `urban` = المحافظات الحضرية (01–04), `lower` = وجه بحري (11–19), `upper` = وجه قبلي (21–29), `frontier` = المحافظات الحدودية (31–35). This grouping gives free regional analytics. Code `88` (خارج الجمهورية) is a national-ID code only, **not** a governorate.

---

## 3. Recommended visual direction

**The one-line brief: an engineering instrument, rendered in Arabic. Dark-first, hairline-precise, monospace-inflected, near-monochrome with a single amber signal.** No gradients. No glass. No purple.

### 3.1 Typography — the single highest-leverage decision

**Use IBM Plex Sans Arabic + IBM Plex Mono. Self-hosted. Variable. OFL-1.1.**

These two faces are **metrically identical**: both have `x-height 516` and `cap-height 698` at 1000 upm (measured directly from the OS/2 tables). Every other candidate needs a `size-adjust` correction — Cairo+Geist Mono needs 106.0%, Tajawal+JetBrains Mono needs 121.1%, Noto Kufi+Space Mono needs 92.5%. This means mixed runs like `استخدم const بدلاً من var` sit on one optical baseline with zero hacks. Plex is IBM's engineering typeface and Plex Mono is a real coding face — it serves the brief directly.

Rejected: **Noto Kufi Arabic** (asc+desc = 2157/1000upm — blows out every button and table row), **Cairo** (1883, borderline), **Tajawal** (zero coverage of extended Arabic-Indic digits U+06F0–06F9).

```css
/* Scope the faces by unicode-range so the wrong file is never downloaded for a run */
@font-face { font-family:"Plex Mono"; src:url(/f/plex-mono-var.woff2) format("woff2-variations");
             unicode-range: U+0000-00FF, U+2000-206F; font-weight:400 700; font-display:swap }
@font-face { font-family:"Plex Ar";   src:url(/f/plex-sans-arabic-var.woff2) format("woff2-variations");
             unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF; font-weight:400 700; font-display:swap }
@font-face { font-family:"Plex Ar";   src:url(/f/plex-sans-arabic-var.woff2) format("woff2-variations");
             unicode-range: U+0000-00FF; font-weight:400 700; font-display:swap }

:root{
  --font-sans: "Plex Ar", system-ui, sans-serif;
  --font-mono: "Plex Mono", "Plex Ar", ui-monospace, monospace; /* Arabic falls through, never to a system face */
}
```

**Three rules that are non-negotiable, and which are the clearest tells of an Arabic site built by someone who doesn't read the script:**

1. **Never apply negative letter-spacing to Arabic.** Arabic is a connected script; tracking breaks the joins. Linear applies `-0.011em` to body and `-0.022em` to large titles — copying that wholesale is a silent ship-blocking bug.
   ```css
   :root{ --tracking-tight: -0.022em; --tracking-label: 0.06em }
   [lang="ar"], [lang="ar"] * { letter-spacing: 0 !important }
   .latin, code, kbd, .mono { letter-spacing: var(--tracking-tight) }
   ```
2. **Never use `line-height: normal`.** The two faces produce different line boxes (Plex Arabic asc 1085/desc −415 vs Plex Mono asc 1025/desc −275). Set explicit unitless line-heights, and **Arabic body = Latin body + 0.15**.
3. **Never uppercase an Arabic eyebrow/label.** Arabic has no case. Mono eyebrows in Latin get `text-transform: uppercase; letter-spacing: 0.06em`. Arabic eyebrows get `font-weight: 590; letter-spacing: 0` and a leading `//` or `٠١` mono numeral instead.

**Digits: Western (0123) everywhere, including UI chrome.** Justification: this is a programming-flavoured platform; timers, scores, governorate codes, marks out of 600, and code samples all need Western digits, and mixing systems within one page is worse than either. Use `font-variant-numeric: tabular-nums` on every table, timer, and score.

**Type scale — dual track** (display and text ramps are separate; merging them into one geometric scale is a template tell). Base is **15px**, not 16px — denser, more tool-like.

| token | size | line-height (ar) | line-height (en) | weight | tracking (Latin only) |
|---|---|---|---|---|---|
| `display-1` | 3.5rem | 1.15 | 1.05 | 590 | −0.022em |
| `display-2` | 2.5rem | 1.2 | 1.1 | 590 | −0.020em |
| `title-1` | 2rem | 1.3 | 1.15 | 590 | −0.016em |
| `title-2` | 1.5rem | 1.4 | 1.25 | 590 | −0.012em |
| `title-3` | 1.25rem | 1.45 | 1.3 | 510 | −0.008em |
| `title-4` | 1.0625rem | 1.5 | 1.4 | 510 | 0 |
| `text-lg` | 1.0625rem | **1.75** | 1.6 | 400 | 0 |
| `text-base` | **0.9375rem** | **1.75** | 1.6 | 400 | 0 |
| `text-sm` | 0.875rem | 1.65 | 1.5 | 400 | 0 |
| `text-xs` | 0.8125rem | 1.55 | 1.4 | 400 | 0 |
| `mono-label` | 0.75rem | 1.4 | 1.4 | 500 | +0.06em (Latin) |

Variable-font weights: use **400 / 510 / 590 / 680**, not 400/500/600/700. Individually imperceptible; collectively it makes the page feel custom-cut.

### 3.2 Color

**Radix 12-step semantics, expressed in OKLCH, dark-first.** The step number *is* the contract: `1` app bg, `2` subtle bg, `3` UI bg, `4` hover, `5` active, `6` subtle border, `7` border + focus ring, `8` hover border, `9` solid, `10` solid hover, `11` low-contrast text, `12` high-contrast text. Identical variable names across themes → theme swap is a class change with zero remapping. OKLCH's perceptually-uniform `L` lets one hue drive both themes.

**Accent: terminal amber.** Chosen deliberately, and the reasoning matters: **green and red are load-bearing for quiz correctness**, so neither can be the brand. Indigo/purple is the AI-default and disqualified. Amber reads as terminal phosphor, is warm against a blue-leaning near-black, and has no semantic conflict anywhere in the product.

```css
:root{
  /* ── neutral: blue-leaning, light ── */
  --n-1:#FCFCFD; --n-2:#F7F8F9; --n-3:#F1F2F4; --n-4:#E9EBEE; --n-5:#E1E4E8;
  --n-6:#E4E6EA; --n-7:#D6D9DE; --n-8:#B9BEC6; --n-9:#8B9099; --n-10:#7A7F88;
  --n-11:#60646C; --n-12:#14171A;

  /* ── accent: terminal amber ── */
  --a-9:  oklch(0.770 0.152 72);   /* ≈ #E9A23B  solid */
  --a-10: oklch(0.725 0.155 68);   /* solid hover */
  --a-11: oklch(0.520 0.120 62);   /* ≈ #8A5A0B  text on light */
  --a-12: oklch(0.300 0.060 60);

  /* ── borders: ALPHA, never solid (Vercel/shadcn convergence) ── */
  --border-subtle: #00000014;  /* solid #eaeaea looks wrong on any tinted bg */
  --border:        #0000001F;
  --border-strong: #00000033;
  --hairline: 1px;
}
@media (min-resolution: 2dppx){ :root{ --hairline: 0.5px } }

@media (prefers-color-scheme: dark){ :root{
  /* Linear-style SURFACE LADDER — depth from surfaces + hairlines, never shadows */
  --n-1:#08090A;  /* near-black with a 2-point blue lean. NOT #000 — prevents OLED smear */
  --n-2:#0E1011; --n-3:#141618; --n-4:#1B1E20; --n-5:#212528;
  --n-6:#232629; --n-7:#2E3236; --n-8:#3B4045; --n-9:#6B7178; --n-10:#7C838B;
  --n-11:#A9AFB6; --n-12:#EDEFF1;
  --a-9:  oklch(0.780 0.150 74);
  --a-10: oklch(0.820 0.150 76);
  --a-11: oklch(0.845 0.130 78);   /* ≈ #FFC46B */
  --border-subtle:#FFFFFF12; --border:#FFFFFF1F; --border-strong:#FFFFFF33;
}}
:root[data-theme="dark"]{ /* …same block; must win over the media query in both directions… */ }
```

**Semantic-only colors** (never brand, never decorative):
`--ok: oklch(0.68 0.16 150)` (إجابة صحيحة), `--err: oklch(0.62 0.20 25)` (إجابة خاطئة), `--warn: oklch(0.75 0.14 85)` (وقت شبه منتهي), `--info: oklch(0.62 0.14 245)`.

**Shadows:** two-layer (ambient + key) **in light mode only**. In dark mode `--shadow-*` resolves to `0 0 0 transparent` and elevation is carried entirely by the surface ladder + hairline borders. Shadows in dark UI read as muddy smears; hairlines read as precision.
```css
--shadow-sm: 0 2px 5px 0 #00000012;
--shadow-md: 0 7px 14px 0 #00000012, 0 3px 6px 0 #0000000f;
--shadow-lg: 0 15px 35px 0 #00000014, 0 5px 15px 0 #00000012;
```

### 3.3 Spacing, radius, layout

**Spacing** — named by pixel value (Stripe's convention; removes all ambiguity):
`2, 4, 8, 12, 16, 20, 24, 32, 48, 64, 80`.

**Radius** — deliberately small. Sharp corners read as precision. **Nothing above 8px on a card.**
`--r-xs: 3px` (badges, kbd) · `--r-sm: 4px` (inputs, buttons) · `--r-md: 6px` (default) · `--r-lg: 8px` (cards, modals, code blocks) · `--r-full: 999px` (**pills only** — status chips, avatars).

**Layout** — two max-widths, always:
`--w-shell: 1152px` (app/marketing) · `--w-prose: 640px` (lesson text, article bodies). Text columns are never full-bleed. Responsive **column count**, not just width: 12 → 8 @768px → 4 @640px.

**RTL is native, not mirrored.** Logical properties exclusively: `margin-inline-start`, `padding-inline`, `inset-inline-start`, `border-inline-end`. Ban `ml-*`/`mr-*`/`left-*`/`right-*` with an ESLint rule. Almost no template does genuine RTL-native layout — this is a free differentiator.

### 3.4 Motion

Curves are GitHub Primer's (the most rigorously documented set, and they ship decision rules). Durations are Linear/Vercel/Stripe measured values.

```css
:root{
  --ease-linear:  cubic-bezier(0, 0, 1, 1);          /* progress bars, loaders only */
  --ease:         cubic-bezier(0.25, 0.1, 0.25, 1);  /* hover, micro-interactions */
  --ease-out:     cubic-bezier(0.3, 0.8, 0.6, 1);    /* DEFAULT — anything entering or exiting */
  --ease-in-out:  cubic-bezier(0.6, 0, 0.2, 1);      /* anything moving/morphing in place */
  --ease-pop:     cubic-bezier(0.175, 0.885, 0.32, 1.1); /* popovers/menus — 1.1 = slight overshoot */

  --d-hover: 160ms;  --d-popover: 200ms;  --d-modal: 300ms;  --d-exit: 120ms;
}
```

**Rules:**
- `ease-out` for enter/exit. `ease-in-out` for move/resize. `ease` for hover. **Never `ease-in` on an exit** — the classic amateur mistake that makes UI feel sluggish.
- **Exits are faster than entrances** (Stripe: 160ms out vs 240ms in). Cap everything at **400ms**.
- Popovers and menus: start at `scale(0.96)` + `opacity 0`, animate with `--ease-pop` over 200ms. This two-token recipe is the highest-ROI motion detail in the whole brief.
- Animate **only `transform` and `opacity`**. Never `width/height/top/left/filter: blur()` — those force layout+paint every frame and are the classic cause of 300ms+ INP on parallax pages. Reported INP reduction from this rule alone: 30–60ms.
- `will-change: transform` surgically, removed after the animation completes.
- Ship `<MotionConfig reducedMotion="user">` on day one — it kills transforms and layout animations app-wide while **preserving** opacity fades, which is the correct behaviour for vestibular safety. Plus a global CSS backstop for non-Motion animation.

### 3.5 "Programming atmosphere" — ten concrete devices, ordered by cost

1. **Mono as the brand carrier (0kB).** IBM Plex Mono for eyebrows, section numbering (`01 / المحاضرات`), metadata (durations, mark counts, timestamps), table headers, `<kbd>` keys, and breadcrumbs. This — not code blocks — is what produces terminal culture without gimmicks. Berkeley Mono/Commit Mono play this role for Linear/Resend.
2. **Hairline dot-grid backdrop (0kB).** Two offset `radial-gradient` layers at ~2% foreground alpha on a 24px grid, plus a `mask-image: radial-gradient(...)` spotlight tracking the cursor via two CSS custom properties updated on `pointermove`. Fixed layer, `pointer-events: none`, behind all content.
3. **Inline code ≠ code block.** Inline: background + 1px border + `0.3em` radius + `0.875em` size. Block: 8px radius, 16px padding, 14px/1.5, `tab-size: 4`, `font-variation-settings: normal; font-feature-settings: normal` reset. ~10 lines of CSS, reads as precision.
4. **0.5px hairlines on retina.** One media query. The most "designed by someone who cares" detail available.
5. **Custom `::selection`** via `color-mix(in oklch, var(--a-9), transparent 72%)`.
6. **Tokenized focus ring.** `--focus-ring-width: 2px`, `--focus-ring-offset: 2px`, color `--a-9`, plus `:focus:not(:focus-visible){outline:none}` and `*{outline-color:transparent}`. `--min-tap-size: 44px`.
7. **Terminal-chrome panels (~0kB).** Three dots, a mono title bar, monospaced content — used for the "how it works" section and empty states. Not for lesson content.
8. **Server-highlighted code with animated reveal (~9kB client).** Shiki runs in an async Server Component (zero client JS for the highlighter; the real code text lands in the SSR HTML for crawlers). A tiny client component then animates a `clip-path` sweep over the *already-highlighted* markup. **Never** per-character `setState` — that's one render + reconcile every ~40ms and is a documented INP killer. Fix `min-height` so the reveal never grows the container.
9. **One WebGL moment (~30–75kB).** A single `@paper-design/shaders-react` `<MeshGradient>` or a hand-rolled `ogl` full-screen quad, in a fixed layer behind the hero, `pointer-events: none`, `speed={0}` under reduced motion. Not r3f.
10. **One 3D object (~200–230kB gzip), below the fold, desktop-only, postered.** Conversion data is unambiguous: LCP <1s → 4.4% conversion; 3–4s → 2.9%; 4s+ → **1.7%**. Video/autoplay heroes *lost* 7% in a 2,000-page study. So: never in the hero. Two-file client wrapper (`next/dynamic` with `ssr:false` throws in Server Components in Next 15/16), a static WebP poster as the `loading` fallback that reserves the exact box (CLS = 0), gated on `useReducedMotion()` **and** `matchMedia('(min-width:1024px)')` so mobile never downloads the three.js chunk. Deep-import drei (`@react-three/drei/core/OrbitControls`) — the barrel is 484kB gzip.

### 3.6 Loading & skeleton UX

Skeletons help **only** when real load is 400ms–3s. Below 200ms they flash; above 3s they read as broken. Users perceive them as 9–12% faster than spinners at identical load times.

- Derive skeleton geometry from the **same layout primitives** as the real component (share a wrapper with identical padding/gap/grid) so the swap is invisible.
- **Vary text-bar widths (100% / 85% / 60%)** — uniform bars are the single biggest "cheap" tell.
- Shimmer left→right over **1.8s** using `transform: translateX()` on a gradient overlay inside `overflow:hidden`. **Never `background-position`** (repaints the whole element).
- Low-contrast token (~5% foreground alpha), never `#eee`. Same radius as the real content. Show 3–5 items, never a full grey screen.
- `animation-delay: 180ms` so fast loads never flash a skeleton.
- `loading.tsx` must be a **Server Component** so the skeleton is in the SSR'd HTML.
- ⚠️ `loading.tsx` auto-wraps `page.js`, `not-found.js`, and *nested* `layout.js` — but **not** the same-segment `layout.js`. A `cookies()` call in the layout above it is the #1 reason a `loading.tsx` "doesn't work".
- Global route progress: `@bprogress/next` (6.5kB gzip). `nprogress` and `next-nprogress-bar` are deprecated.
- Delay/minimum-visible contract as a hook: `useDelayedLoading(150, 300)`.

### 3.7 AI-slop anti-patterns — a hard ban list

The "AI-built website" look is now a nameable cluster ("the Purple Problem"). None of the following ships:

1. ❌ **Purple/indigo → blue gradients.** Anywhere. Note the trap: Linear's accent *is* indigo `#5e6ad2` — the sin is not the hue, it's the **gradient plus the surrounding template**. Our accent is amber, used **flat**, never as a gradient.
2. ❌ **Emoji as icons.** One consistent stroke icon set, one weight, one size grid.
3. ❌ **Glassmorphism / `backdrop-blur` cards.** Blur is reserved for exactly one element: the sticky header (`--header-blur: 20px`).
4. ❌ **The three-up feature-card grid** with uniform radius and soft shadows.
5. ❌ **Radius above 8px on cards.** Pills only for badges/avatars.
6. ❌ **Scroll-triggered fade-in on every section.** Pick **one** orchestrated moment per page, at most.
7. ❌ **Colored 3–4px left-border stripes** on cards/callouts.
8. ❌ **Centered hero + vague headline + two centered CTAs.**
9. ❌ **Inter as the only typeface.**
10. ❌ **A single symmetric max-width for everything.** Two widths, always (§3.3).
11. ❌ **Mirrored-LTR layout with `float: left` and physical margins.** Logical properties only.
12. ❌ **`opacity: 0` entrance animations on above-the-fold LCP content.** Motion SSRs `opacity: 0` into the HTML — the text is crawlable but invisible until hydration, which directly tanks LCP. Hero animates `y`/`scale` only, or uses `initial={false}`.
13. ❌ **Uppercased Arabic labels** and **negative tracking on Arabic**.
14. ❌ **Shadows in dark mode.**

---

## 4. Recommended technical stack

Versions verified against the npm registry **2026-07-25**. One recommendation per decision point.

### 4.1 Foundation

| Decision | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node.js LTS | 24.x | — |
| Package manager | **pnpm** workspaces + catalogs | `11.17.0` | — |
| Monorepo orchestrator | **Turborepo** | `2.10.0` | Single team, Next+Nest. An afternoon of setup vs a week for Nx. Layers on top of pnpm workspaces rather than replacing them. pnpm alone gives no task cache or dependency-aware graph. Nx (23.1.0) is for multi-team enterprise repos. |
| Language | **TypeScript** | `7.0.2` | Go-native compiler, ~8–12× faster type-check, faithful port with no type-system changes, `experimentalDecorators` + `emitDecoratorMetadata` preserved for Nest. **Fallback trigger:** if type-aware ESLint rules or Nest schematics break in the first 48h, drop to `5.9.x` — it's a one-line change. |
| Database | **PostgreSQL** | 17.x | — |
| Cache / rate-limit store | **Redis** (or Valkey 8) | 7.4 | Required, not optional — see §4.3. |

**Layout:**
```
apps/web         Next.js 16
apps/api         NestJS 11
packages/contracts   Zod 4 schemas — the shared boundary
packages/ui          shadcn primitives + design tokens
packages/config      eslint / tsconfig / tailwind presets
```

### 4.2 Deployment topology — **single origin. This is a security decision, not a convenience one.**

Serve Next.js at `example.com` and NestJS at `example.com/api` behind one reverse proxy (Traefik/Caddy on Dokploy) or via Next rewrites. This single choice unlocks, simultaneously:
- `__Host-` cookie prefix (impossible across subdomains)
- `SameSite=Strict` (viable, because there is no cross-site anything)
- **Zero CORS configuration**

Split origins (`app.` / `api.`) force `__Secure-` instead of `__Host-`, `SameSite=Lax`, an explicit CORS allowlist with `credentials: true`, and a shared parent domain. **Decide this before a single line of auth code is written.**

### 4.3 Backend

| Decision | Choice | Version | Why |
|---|---|---|---|
| Framework | **NestJS** | `@nestjs/core@11.1.28`, CLI `11.0.24` | No v12 exists; v11 has been the major line since 2025-01-16. Use SWC (`nest start -b swc`) — it's the default in v11 and ~20× faster builds. |
| Architecture | **Modular monolith**, feature-module folders | — | `src/modules/{auth,users,catalog,courses,lessons,quizzes,attempts,progress,enrollments,media,settings,notifications}`. Cross-module access **only** via the module's `exports` array. **Do not adopt CQRS** — reserve it for at most one module (analytics) later. Repo-wide CQRS is the classic over-engineering trap here. |
| **ORM** | **Prisma 7** | `prisma@7.9.0` + `@prisma/adapter-pg@7.9.0` | v7 removed the Rust engine: bundle 14MB → 1.6MB, up to ~3× faster queries. Both historic objections are gone, and its migration story (`migrate dev/deploy`, shadow DB, drift detection) is the best of the three — which matters most for a schema that will churn constantly. **Drizzle 1.0 is still `1.0.0-rc.4` after ~14 months of RCs** — unacceptable API-churn risk on the query layer. TypeORM 1.1.0 has the weakest inference. |
| Prisma config | ⚠️ specific | — | Prisma 7 generates **ESM by default**, which breaks a CJS Nest build. Required: `generator client { provider="prisma-client"; output="../src/generated/prisma"; moduleFormat="cjs" }` — and the output **must** be inside `src/` or Nest's compiler won't pick it up. Also: `prisma generate` no longer runs after migrate, env vars are no longer auto-loaded (`import 'dotenv/config'`), seeding is no longer automatic. Wire all three into package scripts explicitly. `$use()` middleware is **removed** — use `$extends({ query: { $allModels: { $allOperations } } })`. |
| **Auth** | **Better Auth, hosted inside NestJS** | `better-auth@1.6.25` + `@thallesp/nestjs-better-auth@2.7.0` | Email+password, Google, and Apple in one library; users and sessions in *our* Postgres via the Prisma adapter; NestJS guards remain the single authorization authority. **NextAuth v5 is a dead end** — never reached stable (`5.0.0-beta.32`), Auth.js is now in maintenance mode under the Better Auth team, and its maintainers recommend Better Auth for new projects. Hand-rolling JWT+OAuth is 3–5 engineer-weeks vs ~3 days. ⚠️ Bootstrap Nest with `bodyParser: false` so Better Auth can read raw bodies. ⚠️ The Nest adapter is community-maintained — vendor-pin it. |
| RBAC | Better Auth `admin` + `access` plugins | — | `createAccessControl()` over `{resource: [actions]} as const`. Permissions as `resource:action` (`course:publish`, `quiz:grade`, `user:ban`, `settings:update`) — **never role equality checks**. `checkRolePermission()` is synchronous client-side (zero round-trip) → clean `<Can do="course:publish">` UI gating; `userHasPermission()` enforces the identical statement server-side. |
| Multi-tenancy | Better Auth `organization` plugin + Prisma client extension | — | Only if needed (§7). The session's active org id is exactly the `tenantId` the Prisma extension scopes on — the two snap together. |
| Validation / contracts | **`nestjs-zod` + shared Zod schemas** | `nestjs-zod@5.5.0`, `zod@4.4.3` | **Decisive:** the quiz builder's question model is a `z.discriminatedUnion('type', [...])` that must be shared between the RHF admin form and the API. Sharing it is worth more than class-validator's Swagger ergonomics. Zod 4 emits OpenAPI natively via `z.toJSONSchema()`. **Do not mix with class-validator** — the OpenAPI generation paths conflict. |
| API docs / client | `@nestjs/swagger@11.4.6` → `openapi-typescript` | — | Emit `openapi.json` at build, generate a typed client into `packages/contracts`. |
| Rate limiting | `@nestjs/throttler` + `@nest-lab/throttler-storage-redis` | — | Default in-memory store is per-instance and silently multiplies effective limits by replica count. |
| Password hashing | `argon2` (node bindings) | — | Argon2id, **m=19456 (19 MiB), t=2, p=1**. |
| JWT (service-to-service only) | `jose` | `6.2.4` | Enable the Better Auth `jwt` plugin (`/api/auth/token`, `/api/auth/jwks`, EdDSA) only when a mobile app or worker needs it. |
| Logging | `pino` + `nestjs-pino` | — | Structured JSON, global redaction list, `request_id` via AsyncLocalStorage. |
| Images | `sharp` | `0.35.3` | Re-encode every upload (destroys polyglots + strips EXIF/GPS). |
| Storage | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | `3.1095.0` | Local-disk adapter for dev, S3-API adapter for prod. R2 is S3-compatible → same code, different endpoint. R2 saves ~90% vs S3 at the 1–5TB egress tier, which dominates LMS cost. |

### 4.4 Frontend

| Decision | Choice | Version | Why |
|---|---|---|---|
| Framework | **Next.js** App Router | `16.2.11` / `react@19.2.8` | — |
| Caching | **`cacheComponents: true`** from day one | — | PPR is GA but **only** as part of Cache Components; `experimental.ppr`, `experimental_ppr`, and `experimental.dynamicIO` were all **removed** in 16. Enabling it flips the app to dynamic-by-default. **Retrofitting is the expensive path.** ⚠️ In Next 16, `fetch` is **not** cached by default and blocks rendering — every call into Nest from a Server Component is live unless wrapped in `'use cache'`. ⚠️ `use cache` defaults to **in-memory** storage and dies with the container → **configure a Redis-backed `cacheHandler`** when self-hosting. |
| Routing/edge logic | **`proxy.ts`**, not `middleware.ts` | — | Deprecated in 16. `proxy.ts` runs on Node, so you can verify session JWTs there with `jose` — which Edge middleware could not do reliably. |
| i18n | **None. Arabic-only v1.** | — | `<html lang="ar" dir="rtl">` and nothing else. hreflang, `x-default`, reciprocal return links and a `[locale]` segment are meaningful engineering cost that is pure waste with one language. If English lands later: `next-intl@4.13.4`, `defaultLocale: 'ar'`, `localePrefix: 'as-needed'` so Arabic keeps clean URLs at `/courses/...`. |
| Styling | **Tailwind CSS 4** | `4.3.3` | Logical utilities (`ms-*`/`me-*`/`ps-*`/`pe-*`) only. ESLint rule banning `ml-*`/`mr-*`/`left-*`/`right-*`. |
| Components | **shadcn/ui**, new **`Field`** primitives | — | `Field` / `FieldSet` / `FieldLegend` / `FieldGroup` / `FieldError` supersede the legacy `Form`/`FormField` wrapper. `FieldError` accepts raw Standard Schema issues, so one Zod schema drives client validation *and* server-action errors with zero adapter code. Start the admin from block `dashboard-01` + `sidebar-07`. |
| **Animation** | **`motion`** (not `framer-motion`) | `12.42.2` | The `motion` package is a thin wrapper version-locked to `framer-motion@^12.42.2`. Migration is a find/replace on the import specifier. Use `motion/react-client` in Server Components (keeps *your* tree server-rendered — it does **not** shrink the library payload). Wrap the app in `<LazyMotion features={loadFeatures} strict>` with async-loaded `domAnimation` → **4.6kB + 15kB ≈ 20kB** instead of 34kB; `strict` throws if anyone imports `motion.*` instead of `m.*`. Scroll: `useScroll` + `useTransform` runs on native `ScrollTimeline` where supported — the single biggest INP lever available. |
| Route transitions | Plain CSS `::view-transition-old/new(root)` behind `experimental.viewTransition` | — | Graceful degradation, compositor-threaded. Docs say "not recommended for production" — so do not build core UX on it. `AnimateView` is Motion+ (paid); don't plan around it. |
| **Tables** | **TanStack Table v8** | `8.21.3` | ⚠️ **Not v9** — still `9.0.0-beta.56` and a breaking rewrite. ⚠️ Context7 serves v9-beta docs for `/tanstack/table` by default; an agent scaffolding from them generates code that will not compile. Server-side mode: `manualPagination/Sorting/Filtering: true`, pass `rowCount`, omit the row-model getters, and set `getRowId: (row) => row.id` — without it selection is index-based and bulk actions silently break on page 2. |
| Table scaffolding | Vendor from **`sadmann7/tablecn`** | — | `useDataTable`, `data-table-toolbar`, faceted filters, pagination, floating bulk-action bar. Saves ~2 weeks and gives shareable filtered views free. |
| URL state | **`nuqs`** | `2.9.2` | One `createSearchParamsCache` per admin list route; client controls and the RSC query share one schema. `shallow: false` on filters/page, `throttleMs: 400` on free-text search. |
| **Forms** | **react-hook-form** | `7.83.0` + `@hookform/resolvers@5.4.3` | ⚠️ Not v8 (beta only). Use the three-generic form `useForm<In, Ctx, Out>` whenever the Zod schema uses `.transform()`. ⚠️ Known trap: resolvers historically drop `.refine()` errors applied *on top of* a discriminated union (issue #817) — put "exactly one option must be correct" **inside each union member**, not on the union. |
| Command palette | `cmdk` | `1.1.1` | Every entry renders its keyboard shortcut so the palette doubles as shortcut training (Linear's pattern). |
| Toasts | `sonner` | `2.0.7` | `aria-live="polite"`. Undo actions for reversible destructive ops. |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` | `6.3.1` / `10.0.0` | ⚠️ **Not `@dnd-kit/react@0.5.0`** — pre-1.0 with open ordering bugs (#1564: identical source/target in `onDragEnd`). Reordering 40 lessons must be **one** debounced write of the full ordered id array, not 40. |
| Feature flags | `flags` SDK + custom DB adapter | `4.2.3` | Flag *declarations* in TypeScript (typed, greppable), flag *values* in our `feature_flags` table read through the same `'use cache'` + `cacheTag('flags')` loader. Toolbar override for developers. Successor to `@vercel/flags`. |
| Progress bar | `@bprogress/next` | `3.2.12` | 6.5kB. `nprogress` unmaintained since 2015. |
| Code highlighting | `shiki` server-side | — | Runs in an async Server Component → zero client JS, real code text in the SSR HTML. |
| 3D (one moment only) | `three` / `@react-three/fiber` / `@react-three/drei` | `0.185.1` / `9.6.1` / `10.7.7` | r3f **v9 is required** for React 19 — v8 crashes with `ReactCurrentOwner` errors. Add `transpilePackages: ['three']`. Deep-import drei. |

### 4.5 Explicit rejections

`framer-motion` (superseded) · `next-auth` v4/v5 (dead end) · Drizzle (pre-GA) · TypeORM (weak inference) · TanStack Table v9 (beta) · react-hook-form v8 (beta) · `@dnd-kit/react` (pre-1.0) · `nprogress` / `next-nprogress-bar` (deprecated) · class-validator (conflicts with the Zod contract decision) · Nx (over-scoped) · CQRS repo-wide · `FAQPage` JSON-LD (**Google removed the docs 2026-06-15; zero rich results**) · `Course` "Course info" rich result (deprecated Sept 2025 — use `ItemList` + ≥3 `Course` items on catalog pages instead).

---

## 5. Data model sketch

Postgres. UUIDv7 primary keys (index-friendly, non-enumerable — but **never** the access control). All tables in a named schema `app`, not `public`.

### 5.1 Taxonomy (seed data, admin-editable)

```
governorates(code char(2) PK, name_ar, slug, region, sort_order, is_active)
education_systems(id, slug, name_ar, total_marks int, pass_percent numeric,
                  allows_retakes bool, sort_order)
    -- 'thanaweya_amma' 320/50/false ; 'bacalorya' 600/70/true
academic_years(id, system_id FK, year int, label_ar, badge_ar, sort_order)
tracks(id, system_id FK, slug, label_ar, aliases text[], min_year int, sort_order)
    -- bacalorya: 4 مسارات (min_year 2) ; thanaweya: 3 شعب (min_year 2)
track_faculties(id, track_id FK, name_ar, sort_order)
subjects(id, slug, name_ar, aliases text[])                    -- canonical names only
subject_offerings(id, system_id, year, track_id NULL, subject_id,
                  counts_toward_total bool, level enum('normal','advanced') NULL,
                  elective_group_id NULL, marks int default 100,
                  pass_percent_override numeric NULL,           -- التربية الدينية = 70
                  UNIQUE(system_id, year, track_id, subject_id))
elective_groups(id, track_id, year, label_ar, pick_count int default 1)
```
`subject_offerings` is the load-bearing table: **الرياضيات appears in three different roles**, so a subject is only meaningful scoped by `(system, year, track)`.

### 5.2 Identity & profile

```
-- Better Auth owns: user, session, account, verification, organization, member, invitation
student_profiles(user_id PK FK→user, full_name, gender enum('male','female'),
                 phone citext UNIQUE NOT NULL, phone_verified_at,
                 governorate_code FK, school_name,
                 father_phone, mother_phone,
                 system_id NULL, year int NULL, track_id NULL,     -- nullable: grade-1 undecided
                 elective_subject_id NULL,
                 onboarding_completed_at, created_at, updated_at)
```
Constraint: `CHECK (year IS NULL OR year <> 1 OR track_id IS NULL)` — track must be null in grade 1.

### 5.3 Content

```
courses(id, slug citext UNIQUE, title, subtitle, description,
        system_id, year, track_id NULL, subject_id,
        status enum('draft','published','archived'), instructor_id,
        cover_key, price_cents int default 0, published_at, created_at, updated_at)

course_sections(id, course_id FK, title, summary, position int,
                is_published bool, availability jsonb, UNIQUE(course_id, position) DEFERRABLE)

lessons(id, section_id FK, course_id FK,           -- course_id denormalised for fast queries
        title, kind enum('video','quiz','attachment','text'),
        position int, is_published bool, is_free_preview bool, estimated_seconds int,
        -- access config, copied from the Egyptian baseline:
        visible_from timestamptz, visible_to timestamptz,
        unlocks_after_lesson_id NULL,              -- is_locked_on
        view_limit int NULL, content_group_id NULL,
        -- completion rule lives HERE, not on the video/quiz row:
        completion_mode enum('none','manual','on_view','on_grade','on_pass') default 'manual',
        completion_min_view_seconds int, completion_pass_grade numeric(6,3),
        created_at, updated_at, UNIQUE(course_id, section_id, position))

lesson_videos(lesson_id PK FK, provider enum('youtube','upload','vimeo','bunny','vdocipher','ink','gumlet'),
              external_id, duration_seconds int, poster_key, captions jsonb)
              -- v1: provider always 'youtube', external_id = the 11-char id, NEVER a URL
lesson_attachments(id, lesson_id FK, storage_key, filename, mime, size_bytes, position)
lesson_texts(lesson_id PK FK, body_html)          -- sanitize-html output, allowlisted
```
`content_groups` (shared across courses, add/remove propagates) is a v1.1 table — reserve the FK now.

### 5.4 Question bank (versioned)

```
question_categories(id, parent_id NULL, owner_scope enum('global','instructor','course'),
                    owner_id NULL, name, sort_order)
question_bank_entries(id, category_id FK, external_ref NULL,  -- QTI identifier, future-proofing
                      owner_id, created_at)
question_versions(id, bank_entry_id FK, version int,
                  status enum('draft','ready','hidden'),
                  type enum('mcq_single','mcq_multi','true_false','short_answer','essay'),
                  stem_html, general_feedback_html,
                  default_mark numeric(10,4) default 1, penalty numeric(10,4) default 0,
                  settings jsonb,          -- {single, shuffle, usecase, minWords, maxWords, graderInfo}
                  created_by, created_at, UNIQUE(bank_entry_id, version))
question_options(id, question_version_id FK, body_html,
                 fraction numeric(10,6),   -- 0..1, MAY BE NEGATIVE (per-option negative marking)
                 feedback_html, position)
```
`{option, weight}` as the scoring primitive (not a boolean `is_correct`) makes us **QTI-shaped by construction** — partial credit and negative marking come free, and a future QTI import/export is a serializer, not a migration.

### 5.5 Quizzes & attempts

```
quizzes(id, lesson_id UNIQUE FK,
        mode enum('practice','graded') default 'practice',
        duration_seconds int NULL, open_from, open_until,
        max_attempts int default 0,               -- 0 = unlimited
        grade_method enum('highest','average','first','last') default 'highest',
        retry_cooldown_hours int default 24,
        pass_percent numeric default 70,
        shuffle_questions bool, shuffle_options bool,
        overdue_handling enum('autosubmit','graceperiod','autoabandon') default 'autosubmit',
        grace_seconds int default 60,
        nav_method enum('free','sequential') default 'free',
        review_options jsonb,                     -- see below
        sum_marks numeric, grade_out_of numeric default 100)

quiz_slots(id, quiz_id FK, position int, page int default 0,
           bank_entry_id NULL, pinned_version int NULL,   -- NULL version = latest non-draft
           pool_id NULL, max_mark numeric(10,4), require_previous bool)
quiz_pools(id, quiz_id FK, name, pick_count int,
           points_per_question numeric, source_filter jsonb)  -- {categoryIds, tagIds, difficulty}

quiz_attempts(id, quiz_id FK, user_id FK, attempt_no int,
              state enum('in_progress','overdue','submitted','pending_review','abandoned'),
              started_at, deadline_at,           -- PERSISTED at start; never recomputed
              submitted_at, last_activity_at,
              attempt_token uuid,                -- required on every write; kills stale-tab clobber
              raw_score numeric, scaled_score numeric, passed bool,
              extra_time_seconds int default 0, extra_attempts int default 0,
              UNIQUE(quiz_id, user_id, attempt_no))

attempt_questions(id, attempt_id FK, slot_position int,
                  question_version_id FK,        -- SNAPSHOT. non-negotiable for correct review
                  option_order int[],            -- SNAPSHOT. resume must not reshuffle
                  max_mark numeric, min_fraction numeric, max_fraction numeric,
                  response jsonb, fraction numeric, mark numeric,
                  state enum('todo','complete','needs_grading','graded_right','graded_partial','graded_wrong'),
                  flagged bool, right_answer_text, response_text,
                  answered_at, graded_at, graded_by, feedback_html)

attempt_events(id bigserial, attempt_id FK, attempt_question_id NULL, seq int,
               kind, payload jsonb, actor_id, created_at)   -- append-only audit/regrade trail

grade_appeals(id, attempt_question_id FK, student_note, grade_before numeric,
              grade_after numeric, status, resolved_by, resolved_at)
```

**Hybrid answer storage rationale:** one *mutable* row per question (Canvas's query simplicity) **plus** an append-only event log (Moodle's auditability). Moodle's pure event-log + EAV replay is the #1 source of its quiz performance complaints; Canvas's pure blob loses history.

**`review_options` shape** — four time windows × seven flags:
```json
{ "during":           {"response":false,"correctness":false,"marks":false,"specificFeedback":false,
                       "generalFeedback":false,"rightAnswer":false,"overallFeedback":false},
  "immediatelyAfter": {"response":true,"correctness":true,"marks":true,"specificFeedback":true,
                       "generalFeedback":true,"rightAnswer":true,"overallFeedback":true},
  "laterWhileOpen":   { … }, "afterClose": { … } }
```
Resolve the window **server-side** and **strip disallowed fields in the serializer**. Never send `isCorrect` and hide it in CSS.

**Grading algorithms** (ported verbatim from Moodle):
- MCQ single / true-false: `fraction = chosenOption.fraction`
- MCQ multi: `fraction = clamp(Σ fraction of ticked options, 0, 1)` — the clamp at 0 is what prevents sub-zero questions
- Short answer: first matching pattern wins; `*` → `.*`, everything else `preg_quote`d, anchored, NFC-normalised both sides, `i` flag when case-insensitive
- Fraction → state: `< 0.000001` → wrong; `> 0.999999` → right; else partial (keep the float epsilon)

### 5.6 Enrollment, entitlement, progress

```
enrollments(id, user_id FK, course_id FK,
            source enum('free','manual','purchase','coupon','code'),
            status enum('active','expired','revoked','completed'),
            activated_at, expires_at, completed_at,
            progress_percent numeric(5,2), last_lesson_id,
            UNIQUE(user_id, course_id))

access_grants(id, user_id FK,                 -- the flexible entitlement object; NOT a boolean
              scope enum('platform','course','subject_teacher','unassigned'),
              course_id NULL, subject_id NULL, instructor_id NULL,
              source enum('free','manual','purchase','coupon','code','scholarship'),
              scholarship_kind enum('orphans','financial','twinz') NULL,
              is_permanent bool, valid_from, valid_to, created_by, created_at)

lesson_progress(id, enrollment_id FK, lesson_id FK,
                completion numeric(5,4),        -- 0..1, Open edX style; partial video progress
                state enum('not_started','in_progress','completed','passed','failed'),
                watched_seconds int,            -- distinct time watched (anti-scrub)
                max_position_seconds int,       -- furthest point reached
                open_count int, completed_at, updated_at,
                UNIQUE(enrollment_id, lesson_id))

subject_attempts(id, user_id FK, subject_offering_id FK, attempt_no int,
                 sitting enum('first','second'), academic_year char(9), -- '2026/2027'
                 score numeric, is_best bool, recorded_at)
                 -- makes التحسين / best-score-wins representable
```

**Video completion rule (decisive):** auto-complete requires **both** `max_position_seconds >= 0.95 * duration` **and** `watched_seconds >= 0.70 * duration`. Position-only (Open edX's `COMPLETION_VIDEO_COMPLETE_PERCENTAGE = 0.95`) is trivially defeated by seeking. Text/attachment completes after a 5000ms dwell. **Always also offer a manual "أنهيت الدرس · التالي" button** — that's what learners expect commercially (Thinkific's model). Client posts heartbeats every 10s to `POST /lessons/:id/heartbeat {position, delta}`; the server accumulates. **Never trust a client-sent percentage.**

### 5.7 Platform configuration

```
site_settings(id int PK CHECK (id = 1), data jsonb, updated_by, updated_at)
    -- singleton enforced in the DATABASE, not the UI (Sanity's documented failure mode
    --  is duplicate settings documents)
    -- data: {branding:{logoLight,logoDark,favicon,primary,radius},
    --        seo:{...}, contact:{...}, features:{...}, copy:{…Arabic strings…}}

feature_flags(key PK, description, enabled bool, rollout jsonb, updated_at)
navigation_items(id, parent_id NULL, label_ar, href, icon, position, visible_to text[])
home_blocks(id, key nanoid, type enum('hero','courseGrid','stats','testimonials','faq','cta'),
            props jsonb, position int, is_published bool)
media_assets(id, storage_key, filename, mime, size_bytes, width, height, blurhash,
             uploaded_by, created_at)      -- store the KEY, never a full URL
audit_log(id bigserial, occurred_at timestamptz, actor_user_id, actor_ip inet,
          actor_user_agent, action, resource_type, resource_id, outcome,
          metadata jsonb, request_id uuid, prev_hash)   -- INSERT-only for app_runtime

sessions_devices(id, user_id FK, session_id, device_name, device_type,
                 ip inet, visitor_visit_id, last_seen_at, logged_in_at, revoked_at)
```

Every settings/nav/flags/home-blocks loader is `'use cache'` + `cacheTag('settings:<key>')` + a `cacheLife` profile. The admin save action calls **`updateTag()`** (read-your-own-writes, editor sees it instantly) — not `revalidateTag()`. Per-entity tags too (`cacheTag('course', id)`) so publishing one course doesn't blow the whole content cache. ⚠️ `cacheTag` limits: 128 tags/call, 256 chars each; longer tags are silently skipped with only a console warning.

Branding renders as an inline `<style>:root{--a-9:…;--r-md:…}</style>` in the root layout from the tagged loader — no FOUC, no build step, no per-tenant stylesheet. **Constrain the admin colour picker to token slots. Never let an editor type raw CSS.**

---

## 6. Security checklist

Ordered by importance. Mapped to **OWASP Top 10:2025** (renumbered — SSRF is now folded into A01).

### P0 — decide before writing auth code

1. **Single origin** (§4.2). Cookies: `__Host-at` (access, 10–15 min, `Path=/`) and `__Secure-rt` (refresh, 30 days, `Path=/api/auth`). Both `httpOnly; Secure; SameSite=Strict`. `__Host-` structurally blocks cookie-forcing from any subdomain — the exact attack that defeats naive double-submit CSRF.
2. **Session tokens in httpOnly cookies — both of them.** Not the popular "access token in a JS variable + refresh in a cookie" split: XSS can still read the variable or call the refresh endpoint, and it costs you SSR entirely (a Server Component cannot read a JS-memory variable). OWASP: *"Do not store session identifiers in local storage."*
3. **Argon2id: m=19456 (19 MiB), t=2, p=1.** All five OWASP parameter sets are equal-strength; this one is the right RAM/CPU tradeoff for a container. `p=1` explicitly — Node's bindings run on the libuv threadpool, so `p>1` multiplies memory without helping latency. Calibrate to ~100ms/verify on the production instance. Pepper via HMAC-SHA384 with the key in the secrets store, not Postgres — a pure DB dump is then uncrackable. Bcrypt is disqualified (OWASP: legacy only; silent 72-byte truncation).
4. **Password policy per NIST SP 800-63B-4:** `@MinLength(15) @MaxLength(64)`, **no composition rules**, **no rotation**, and a compromised-password check (HIBP k-anonymity range API, or a local top-100k list). This reverses what most codebases still do.

### P1 — authorization (A01, the #1 category)

5. **Fail-closed policy layer.** A global guard that **throws at boot** if any registered route lacks an explicit `@Policy()` decorator. Plus an integration test that enumerates every route and asserts a policy is present.
6. **Scope queries to the actor; never fetch-then-check.** Not `findUnique({where:{id}})` + `if (course.ownerId !== user.id)` — that's what gets forgotten on the 40th endpoint. Repository methods take the actor and compile to `WHERE id = $1 AND (enrollments.user_id = $2 OR courses.is_free_preview)`. UUIDv7 is defence-in-depth only, never the control.
7. **Mass assignment.** `new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } })`. **Separate DTOs per role** (`UpdateProfileDto` vs `AdminUpdateUserDto`). Never `prisma.x.update({ data: dto })` — spread named fields only. Highest-risk fields here: `role`, `system_id`, `year`, `track_id`, `enrollment.status`, `attempt.score`, `lesson_progress.completion`. **The realistic attack is a student PATCHing `{completed:true}` or `{score:100}` onto their own row — not privilege escalation.**

### P2 — quiz integrity (A06 Insecure Design)

8. **Correct answers never leave the server before submission.** Question fetch selects `id, stem_html, options[{id, body_html}]` only. Enforce with a Prisma `select` (never `include`) **plus** a `@Exclude()` serializer as a second layer, **plus** a contract test that GETs a quiz as a learner and asserts the raw JSON body contains no `fraction`, `isCorrect`, or `feedback` keys.
9. **Server-side everything:** grading in `submitAttempt` from fresh DB reads; `deadline_at` persisted at start and enforced with a grace window; `attempt_token` + `attempt_no` required on every write; reject any submission where `submitted_at IS NOT NULL` (replay for a better score); attempt limits and cooldowns enforced server-side; per-attempt submission rate limit.
10. **Stop at proportionate.** Browser lockdown and proctoring are theater against a determined student with a second device. If quizzes ever carry real stakes, the answer is randomized large question banks + item-response analytics for leak detection — not client-side detection.

### P3 — input & injection (A05, A01-SSRF)

11. **YouTube: never fetch the user-supplied URL. Parse and discard.** Regex-extract the 11-char id (`/^[A-Za-z0-9_-]{11}$/`) from the known host forms (`youtube.com/watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`), store **only the id**, and reconstruct server-side as `https://www.youtube-nocookie.com/embed/{id}`. This eliminates the SSRF class rather than filtering it. If metadata is wanted, call the YouTube Data API with our own key and the extracted id.
12. **Rich text:** `sanitize-html` on write with a tight allowlist (`p br strong em u ul ol li h2 h3 blockquote code pre a`), `allowedAttributes: {a: ['href','title','rel','target']}`, `allowedSchemes: ['http','https','mailto']`, forced `rel="noopener noreferrer nofollow"`. Deny `style`, all `on*`, and **all `<iframe>`** (embeds go through the video-id field, never through HTML). Second DOMPurify pass at render. CSP nonce as the backstop.
13. **Ban raw SQL escape hatches in CI.** ESLint `no-restricted-syntax` hard-failing on `$queryRawUnsafe` / `$executeRawUnsafe`. Sort parameters map through a hardcoded `{title:'title', created:'createdAt'}` object — column names cannot be parameterized. Note operator injection: a JSON-parsed `where` accepting `{"phone":{"startsWith":"01"}}` lets a client brute-force a field character-by-character — which is why `forbidNonWhitelisted` is an *injection* control, not just a mass-assignment control.

### P4 — abuse & rate limiting (A07)

14. **Layered named throttlers** via `APP_GUARD`: `short` 10/1s, `medium` 60/1min, `long` 1000/1h, Redis-backed. On `/auth/login`: `@Throttle({ default: { limit: 5, ttl: minutes(15), blockDuration: minutes(15) } })` with a `getTracker` keyed on **`email + IP`** — IP-only lets one NAT'd school lock itself out; account-only lets a botnet lock out a victim. Same limits on `/auth/forgot-password`, `/auth/verify-email`, and the OAuth callback (commonly left unthrottled).
15. ⚠️ **`trust proxy` must be a specific hop count or proxy IP, never `true`** — otherwise a client spoofs `X-Forwarded-For` and becomes un-throttleable.
16. **Progressive delay, not hard lockout.** Attempts 1–3 free, then `2^n` seconds capped at 30s; soft lock at 10 for 15 minutes, auto-clearing, plus an "unusual sign-in activity" notification. Two details usually missed: (a) run Argon2 against a **dummy hash** when the account doesn't exist, so timing doesn't enumerate; (b) return an **identical** error and status for unknown-user / wrong-password / locked — a distinct "account locked" message is itself an existence oracle.

### P5 — headers & transport (A02, now #2 and the most likely thing to actually bite)

17. **Split CSP by route.** Nonce-based CSP **disables static optimization, ISR and PPR** — so apply it via the `proxy.ts` matcher **only** to authenticated routes (`/dashboard`, `/learn`, `/admin`) and use hash/SRI-based CSP on the public catalog so it stays cached.
    ```
    script-src 'self' 'nonce-{v}' 'strict-dynamic'; object-src 'none'; base-uri 'self';
    form-action 'self'; frame-ancestors 'none';
    frame-src https://www.youtube-nocookie.com; img-src 'self' blob: data: https://i.ytimg.com;
    upgrade-insecure-requests
    ```
    ⚠️ `'strict-dynamic'` makes browsers **ignore host allowlists in `script-src`** — adding a domain there is a no-op; third-party scripts must receive the nonce. **Ship `Content-Security-Policy-Report-Only` with a report endpoint for 1–2 weeks first.** A strict CSP deployed blind will break the app.
18. `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` · `Referrer-Policy: strict-origin-when-cross-origin` · `X-Content-Type-Options: nosniff` · restrictive `Permissions-Policy`.
19. **CSRF in three layers**, not one: `SameSite=Strict` (defence-in-depth only — OWASP now explicitly discourages relying on it, and warns the naive double-submit pattern is bypassable by anyone who can write cookies on the domain); a required custom header (`X-CSRF-Token`) enforced by a guard on all state-changing methods (forces a CORS preflight that a cross-site form POST cannot satisfy); and server-side `Origin` / `Sec-Fetch-Site` validation (reject unless `same-origin` or `none`).

### P6 — data layer & operations

20. **Three Postgres roles.** `app_owner` (DDL, migrations only, in CI). `app_runtime` (what Nest connects as — `SELECT/INSERT/UPDATE/DELETE` only, **no DDL**, so SQLi cannot `DROP` or `CREATE FUNCTION`; `ALTER DEFAULT PRIVILEGES` so new tables inherit). `app_readonly` (analytics). `REVOKE ALL ON SCHEMA public FROM PUBLIC`. **Deny `DELETE` on `audit_log` to `app_runtime`** (INSERT-only). Never grant `pg_read_all_data`. `sslmode=verify-full` with the CA pinned (`require` skips hostname verification). Set `statement_timeout` and `idle_in_transaction_session_timeout` on the runtime role.
21. **Uploads:** extension allowlist → magic-byte check via `file-type` (reads the buffer, not the `Content-Type` header) → **re-encode every image through `sharp`** (destroys polyglots, strips EXIF/GPS) → store under a UUID key. **Serve from a different origin than the app** — a same-origin HTML upload is same-origin XSS regardless of CSP. `nosniff` + `Content-Disposition: attachment` for non-images. Size cap at **both** the reverse proxy (the one that actually prevents disk exhaustion) and the app. Presigned direct-to-bucket PUT, with `ContentType` and `ContentLength` constrained **inside the signature** — otherwise the presigned URL is an open unauthenticated upload endpoint.
22. **Audit log**, hash-chained (`prev_hash`), covering: every admin action (publish/unpublish, role change, quiz answer edit, enrollment override, grade appeal resolution, settings update), refresh-token reuse detection, lockout triggers, repeated 403s. Pino with a global redaction list (`authorization`, `cookie`, `password`, `token`, `refreshToken`, `client_secret`) — JSON encoding also neutralizes CR/LF log injection that plain-text lines don't. ⚠️ **A09:2025 is Logging *&amp; Alerting* Failures** — logs nobody alerts on don't count. Wire token-reuse and lockout to a real channel.
23. **Secrets:** commit only `.env.example`; `gitleaks` as a pre-commit hook **and** a required CI check (pre-commit alone is bypassed with `--no-verify`). Validate config with a Zod schema at boot so a missing signing key **crashes at startup** rather than signing with `undefined`. Audit every `NEXT_PUBLIC_` prefix specifically — those ship to browsers. Highest-value secrets: Argon2 pepper, JWT private key, Apple `.p8`, Google client secret, Postgres password, S3 credentials.
24. **Apple Sign In operational reality:** the `client_secret` is a **generated, expiring ES256 JWT** (`iss`=Team ID, `sub`=Services ID, `aud`=`https://appleid.apple.com`, max 6 months), not a static env var — build a provider that regenerates at ~5 months. Apple returns the user's name and email **only on the very first authorization** — persist immediately or it's gone forever. Hide My Email relay addresses are real deliverable addresses. **Apple does not support `http://localhost`** — provision a staging HTTPS domain early.
25. **OAuth id_token verification:** always pass `algorithms: ['EdDSA'|'ES256']` **explicitly** — never let the library read `alg` from the token. Validate `iss`, `aud` (array, for future mobile clients), `exp`, `nbf`, `jti`, and a distinct `typ`. Key users on `(provider, provider_sub)` — **never on email**, which is mutable. **Reject auto-linking when `email_verified` is false — that's a full account-takeover primitive.** Cache JWKS in memory per the `Cache-Control` header; never fetch per request. Cross-JWT confusion is a live risk here because we verify *both* Google/Apple tokens and our own — strict `aud` is what prevents an Apple id_token being presented as our access token.
26. **Refresh-token rotation per RFC 9700 §4.14.2.** Table `(id, family_id, user_id, token_hash, prev_id, expires_at, used_at, revoked_at, ip, user_agent)`; store SHA-256 of the token (it's high-entropy random — a fast hash is correct; do **not** Argon2 it). On refresh, look up inside a `SERIALIZABLE` transaction; if `used_at IS NOT NULL` → replay → **revoke the entire family**, emit a high-severity audit event, force re-login. Add a **~10s grace window** where the immediate predecessor returns the same successor — otherwise two concurrent tabs race and self-revoke.
27. **Fail closed on exceptional conditions (A10:2025, new).** An ORM error or a failed JWKS fetch must deny, not allow. Stack traces never reach the client.

---

## 7. Open questions for the founder

Six decisions that genuinely block work. Everything else in this brief is decided.

### Q1 — Free forever, or is there a paid path? *(blocks: entitlement, checkout, code subsystem)*
The brief says local/free. But the entire Egyptian market runs on **prepaid scratch codes bought at bookshops** (~200 EGP/teacher on Acwad, ~150 EGP/course, ~350–599 EGP for all-subject annual bundles), settled through an in-platform wallet, with Fawry cash reference as the dominant rail. Card-only checkout excludes most students.
- **If free forever:** we skip the wallet, codes, outlets and store-locator entirely — that's easily as much work as everything else combined.
- **If paid is coming:** we must ship the `access_grants` shape (already in §5.6) and the "unassigned credit" concept now, because retrofitting a boolean `has_course` into a grant object after launch is a data migration across every enrollment.

**What we need:** just "free forever" / "free now, paid within 12 months" / "paid at launch". *(§5.6 already hedges — this only changes how much we build, not the schema.)*

### Q2 — What is the actual subject scope for v1? *(blocks: content roadmap, seed data)*
The research says grade-2 بكالوريا carries **~67% of the final mark** and there are **no grade-3 بكالوريا students until 2027/2028** — while grade-3 ثانوية عامة demand exists today. That's a real fork.
- **(a)** بكالوريا grade 1 + grade 2, one مسار (probably `engineering_cs`, matching the founder's own background and the brand) — narrow, deep, defensible.
- **(b)** All four مسارات at grade 2 — 3 shared + 8 elective subject trees.
- **(c)** بكالوريا + ثانوية عامة grade 3 in parallel.

**What we need:** which systems × years × tracks × subjects for launch. This determines whether the taxonomy seeder is 12 rows or 60.

### Q3 — Device limits and view quotas: on or off at launch? *(blocks: support model, not code)*
Both mechanics are built either way (§1.1 #6, #7). The question is whether enforcement is **on**.
- Every competitor enforces single-active-session, and every one of them puts a **support hotline in the kick dialog** because legitimate multi-device students hit it constantly.
- Enforcing view limits generates a permanent stream of "grant me more views" tickets — which is why بسطتهالك ships an admin button for exactly that.

**Our recommendation:** launch with **2 concurrent sessions**, a self-service "أجهزتي" page, a 3-per-month self-reset quota, **view counting on but enforcement off**, and **dynamic watermarking on** (the student's phone number overlaid on the player) — because watermarking is the only anti-piracy measure that actually works and it generates zero support load.
**What we need:** is there a staffed support channel? If not, all hard limits stay off.

### Q4 — Is there a mobile app coming? *(blocks: auth architecture — expensive to change later)*
Given the existing Flutter work (Avero, Help Me), this seems likely.
- **Web-only:** httpOnly cookies, single origin, done.
- **Native app:** cookies don't work naturally → we need the Better Auth `jwt` plugin (JWKS + `/token`) enabled from day one, Apple's **native `idToken` flow with `appBundleIdentifier`** in addition to the web Services ID flow, and OAuth public-client PKCE. Also note Huawei AppGallery is a required distribution target in this market — Android+iOS is not enough.

**What we need:** yes / no / "maybe in year 2". "Maybe" means we enable the jwt plugin now (cheap) rather than rewriting the auth layer later (not cheap).

### Q5 — Arabic only, or Arabic + English? *(blocks: routing, SEO, ~1 week of work)*
We have decided **Arabic-only for v1** — no `next-intl`, no `[locale]` segment, no hreflang, just `<html lang="ar" dir="rtl">`. That saves real engineering.
- If English is coming, we need the `[locale]` layer from the start (`defaultLocale: 'ar'`, `localePrefix: 'as-needed'` so Arabic keeps clean URLs).
- Also: `ar` or `ar-EG`? `ar-EG` is only justified with Egypt-specific pricing/dialect/availability; otherwise plain `ar` targets all Arabic speakers and avoids fragmenting signals. Reported hreflang failure rate on Arabic sites is 40–50%, almost always missing reciprocals.

**What we need:** confirm Arabic-only, or tell us English is in the 12-month plan.

### Q6 — Multi-teacher, or the founder's own content only? *(blocks: RBAC surface, question-bank scoping, tenancy)*
This has the widest blast radius of the six.
- **Single instructor:** `question_categories.owner_scope = 'global'`, roles are `admin` / `student`, no tenancy.
- **Multiple teachers on one brand:** add `instructor` and `ta` roles, scope banks per-instructor, add "who can see whose students".
- **White-label (teachers get their own subdomain, Al-Shater Academy's model):** full multi-tenancy — Better Auth `organization` plugin, a `tenantId` discriminator on every table, a request-scoped Prisma extension injecting the filter, `cacheTag('settings:${tenantId}:branding')`, and per-tenant branding. **This is the single most expensive thing to retrofit in the entire brief.**

**What we need:** one of those three. If there is any chance of #3 within two years, we add the `organization_id` column now — it is nearly free today and a multi-week migration later.

---

### Lower-priority items to confirm before the taxonomy seeder runs
- **600 vs 700 total marks** — the ministry's 10-point comparison and the July 2026 youm7 breakdown both say **600**; منصة معارف says 700. We are hardcoding 600. Confirm against the official circular.
- **التربية الدينية grouping** — youm7 lists it among grade-1 core subjects; filgamaa puts it in the non-counted group. Both agree: 70% to pass, excluded from the total. We treat it as non-counted. Display grouping in the content tree needs a call.
- **التربية الرياضية** — only one source mentions it. We are omitting it.
- **Canonical track wording** — outlets vary (`مسار الهندسة وعلوم الحاسب` / `الهندسة والحاسبات` / `العلوم الهندسية والتكنولوجيا`). We should source the exact wording from the ministerial decision so the form matches what students see on their school papers. The `aliases text[]` column absorbs the variance for search either way.
- **اللغة الأجنبية الأولى/الثانية options** — الإنجليزية / الفرنسية / الألمانية / الإسبانية / الإيطالية, and which combinations are permitted per school. Matters because اللغة الأجنبية الثانية becomes a **graded** elective in the الآداب والفنون track at grade 2.
- **Do grade-1 curricula actually differ between systems?** One source indicates `البرمجة وعلوم الحاسب` exists in بكالوريا grade 1 but not in ثانوية عامة grade 1. If they're identical, all grade-1 content is shared across both systems — a large content-reuse win.