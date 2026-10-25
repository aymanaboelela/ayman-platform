# أ. محمود الوزير — Arabic, الإعدادي + الصف الأول الثانوي

The setup record for this teacher's platform. Read it before picking the work
up again. It holds no secrets: those live in Dokploy only.

## Who and what

| | |
|---|---|
| Display name (`TENANT_DISPLAY_NAME`) | أ. محمود الوزير |
| Subject (`TENANT_SUBJECT`) | `arabic` |
| Grades (`TENANT_GRADES`) | `prep1,prep2,prep3,sec1`: الصف الأول/الثاني/الثالث الإعدادي + الصف الأول الثانوي |
| Look | preset `board`, then `accentHue = 185` (teal, «أخضر شوية») set in his `/admin/settings` → الهوية البصرية |
| Suggested `TENANT_KEY` | `mahmoud-elwazir` |
| Domain | **still missing**, comes from the owner |
| WhatsApp number / login email | **still missing**, comes from the owner |
| Photos (portrait, logo) | **still missing**, comes from the owner. Upload from his admin |

Requested by the owner on 2026-10-25: his own full stack (own Dokploy compose,
Postgres, Redis, domain), built from the same repo and rebuilt by CI on every
merge to `main`, with a blue look that later became «أخضر شوية».

## Status

| Step | State |
|---|---|
| Grades feature: PR #688 (`TENANT_GRADES`, preparatory stage, grade picker, grade pages) | ✅ CI green, ⏳ **waiting for the owner to merge**. Auto mode blocks Claude from merging |
| Landing content (home blocks) | ✅ written and tested locally, not applied anywhere live |
| Stack on the server (Dokploy project + compose + env + domains) | ❌ not created. Needs #688 live AND the domain |
| DNS / nameservers | ❌ needs the domain |
| Look on the live stack (preset + hue) | ❌ after the stack exists |
| Photos / bio | ❌ waiting for the owner |
| Backups R2 bucket, WhatsApp pairing | ❌ after the stack exists (see `docs/runbooks/new-tenant.md` §4–§5) |

## How to finish, in order

1. **Merge #688** and wait for Ayman's stack to redeploy. The «مدرّس جديد»
   form only shows the grade chips after that.
2. On **aymanaboelela.com/admin/platforms/new** («مدرّس جديد»), fill in:
   - name «أ. محمود الوزير», subject «اللغة العربية»;
   - tick the grade chips: الصف الأول/الثاني/الثالث الإعدادي + الصف الأول الثانوي;
   - login email, WhatsApp, domain (media host = `media.<domain>`);
   - look: «board», accent «blue» (the hue is changed after boot, step 4);
   - press «اعمل المنصة», then wait about 10 min until «الموقع بيرد».
3. If the run created the Cloudflare zone, point the registrar's nameservers
   at the two it prints.
4. Sign in to his admin. Set الهوية البصرية to «board» with custom hue **185**.
   Then apply the landing content:
   ```bash
   node deploy/tenants/apply-home-blocks.mjs https://<his-domain> <admin-email> '<password>' \
     deploy/tenants/arabic-teacher-home-blocks.json
   ```
   Both files sit in the git-ignored `deploy/tenants/` folder on the owner's
   Mac. The block content is copied below, in case that folder is gone.
5. Upload his portrait (الهوية البصرية), which replaces the «أ» box in the
   hero. Write his bio in «عن المدرّس», then add an `instructor` block.
6. Verify **after a restart, not right after a redeploy**
   (`tenant-build-cache-serves-ayman`):
   - title «… — اللغة العربية — الإعدادي والثانوي»;
   - 4 grade tiles on the landing page;
   - `/years/prep1` works and `/years/1` is a 404;
   - signing up shows one «الصف الدراسي» select with the four grades.
7. Once he has changed his password: «إنهاء الإعداد» on his card. Then set up
   backups (own R2 bucket) and have him pair WhatsApp from his admin.

## Landing content (home blocks, in this order)

- **hero**:
  - eyebrow «اللغة العربية · إعدادي وأولى ثانوي»;
  - headline «العربي بقى سهل»;
  - subheadline «نحو وقراءة ونصوص وقصة وتعبير — بالترتيب، وبأمثلة من الامتحان»;
  - lead «شرح فيديو لكل درس، وتدريب عليه، وامتحان في نفس الجلسة — والدرجات بتبان أول بأول.»;
  - buttons «يلا نبدأ» → `/register` and «الكورسات» → `/courses`;
  - stats: 4 صفوف دراسية · إعدادي (أولى وتانية وتالتة) · ثانوي (الصف الأول).
- **yearTracks**: the grade tiles.
- **whyRail** «ليه العربي هنا مختلف», eight items:
  - شرح بالترتيب
  - النحو بالأمثلة
  - امتحان بعد كل درس
  - امتحانات شهرية
  - واجب ومتابعة
  - ولي الأمر في الصورة
  - مساعد بيرد في أي وقت
  - من أي جهاز
- **courseGrid**: «الكورسات».
- **faq** «أسئلة بتتسأل كتير», five questions: which grades, how to pay
  (إنستاباي / فودافون كاش), parents' code, missed lessons, exams.
- **No `cta` block.** The board preset appends its own closing band. Its line
  «أول محاضرة مفتوحة … من غير فلوس» is shared board copy; confirm he really
  gives the first lecture free.

No testimonials or student counts. Nothing has been earned yet, and invented
numbers are what the GEO audits look for.

## Known limits of the grades feature

These still key on the year NUMBER, so «أولى إعدادي» and «أولى ثانوي» look the
same in them:
- centre slots
- books and PDFs
- practice sets
- the marketing audience
- the admin students filter

Fix one when he actually uses that feature. See `docs/teachers-platform.md` §7.

## Local demo (how it was tested)

- Throwaway DB `arabic_tenant_test` (`createdb`, `prisma migrate deploy`, then
  `tsx src/scripts/seed.ts` with the TENANT_* values above).
- API on 3310, web on 3210 (Turbopack, from a root-disk worktree with
  `cp -Rc` node_modules).
- Test logins:
  - admin `admin@arabic.test` / `Test-Admin-Pass-2026!`
  - student `student1@arabic.test` / `Student-Pass-2026!`

All of this is local only; drop the DB with `dropdb arabic_tenant_test`.
