-- «الصفحة الرئيسية» — the landing copy that lives in a table, not in the repo.
--
-- WHY A MIGRATION AND NOT JUST A COPY EDIT
--
-- Same reason as `20260809000000_hero_rotating_copy`, and the same trap it
-- documents: `landing.*` in `ar.ts` is only the SEED. `DEFAULT_HOME_BLOCKS`
-- writes it into `app.home_blocks` on first seed, and from then on the ROW is
-- what the page renders — /admin/home edits it. So #175 rewrote every gendered
-- sentence on the platform and the home page went on saying «شوف الكورسات
-- الأول» and «لأول مشروع تكتبه لوحدك» to a girl reading it, because those
-- words had not come from the file since the day the database was seeded.
-- Production was read back with curl after that deploy; that is how this was
-- caught rather than shipped.
--
-- WHY EACH SENTENCE IS MATCHED WITH ITS JSON QUOTES AROUND IT
--
-- `"شوف الكورسات الأول"` and not `شوف الكورسات الأول`, because the NEW text is
-- «نشوف الكورسات الأول» — which CONTAINS the old one. Matched bare, a second
-- run would find the old sentence inside the new one and produce «ننشوف
-- الكورسات الأول». With the quotes the pattern is the whole JSON value, so it
-- matches the old string and nothing else, and the statement stays a genuine
-- no-op on every later run. (Caught by running this file twice against a
-- local database before it was committed.)
--
-- WHY IT IS SAFE
--
-- Each statement rewrites ONE exact sentence and only where that exact
-- sentence is still stored — an admin who has reworded a block from
-- /admin/home no longer matches, and their words are left alone. A row that
-- does not exist is a no-op.
--
-- `REPLACE` over `props::text` rather than `jsonb_set`, because these strings
-- sit at four different depths (hero fields, an element of the `rotatingAr`
-- array, an object inside the why-rail `items` array, an FAQ pair) and one
-- form covers all of them. None of the sentences contains a double quote or a
-- backslash, so the substitution cannot malform the JSON — asserted by the
-- script that generated this file, and by the `::jsonb` cast on every row it
-- touches.

-- coursesTitle
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"ابدأ بكورس النهارده"', '"نبدأ بكورس النهارده"')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"ابدأ بكورس النهارده"%';
-- ctaPrimary
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"افتح حسابك مجانًا"', '"حساب مجاني في دقيقة"')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"افتح حسابك مجانًا"%';
-- ctaSecondary
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"شوف الكورسات الأول"', '"نشوف الكورسات الأول"')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"شوف الكورسات الأول"%';
-- faq10A
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"لأ، ولا برنامج واحد. المحرّر شغّال جوه المنصة نفسها، بتكتب فيه وتشغّل من المتصفح على طول."', '"لأ، ولا برنامج واحد. المحرّر شغّال جوه المنصة نفسها، والكتابة والتشغيل من المتصفح على طول."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"لأ، ولا برنامج واحد. المحرّر شغّال جوه المنصة نفسها، بتكتب فيه وتشغّل من المتصفح على طول."%';
-- faq10Q
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"محتاج أنزّل برامج على جهازي عشان أكتب كود؟"', '"لازم أنزّل برامج على جهازي عشان أكتب كود؟"')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"محتاج أنزّل برامج على جهازي عشان أكتب كود؟"%';
-- faq1A
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"من مسار التأسيس. بيشرحلك المصطلحات والأفكار الأساسية الأول، وبعدين تدخل على الكود بتمارين صغيرة بتكبر معاك."', '"من مسار التأسيس. بيشرح المصطلحات والأفكار الأساسية الأول، وبعدين الكود نفسه بتمارين صغيرة بتكبر مع الوقت."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"من مسار التأسيس. بيشرحلك المصطلحات والأفكار الأساسية الأول، وبعدين تدخل على الكود بتمارين صغيرة بتكبر معاك."%';
-- faq2A
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"هتكتب من أول محاضرة. كل جزئية وراها تمرين، وفيه محرّر شغّال جوه المنصة تجرّب فيه من غير ما تنزّل أي برنامج."', '"الكتابة من أول محاضرة. كل جزئية وراها تمرين، وفيه محرّر شغّال جوه المنصة للتجربة من غير تنزيل أي برنامج."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"هتكتب من أول محاضرة. كل جزئية وراها تمرين، وفيه محرّر شغّال جوه المنصة تجرّب فيه من غير ما تنزّل أي برنامج."%';
-- faq3A
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"كل درس وراه اختبار قصير بيتصحّح فورًا، ونتايجك كلها بتتجمّع في صفحتك عشان تشوف مستواك ماشي فين."', '"كل درس وراه اختبار قصير بيتصحّح فورًا، ونتايجك كلها بتتجمّع في صفحتك عشان المستوى يبقى باين رايح فين."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"كل درس وراه اختبار قصير بيتصحّح فورًا، ونتايجك كلها بتتجمّع في صفحتك عشان تشوف مستواك ماشي فين."%';
-- faq3Q
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"أعرف إزاي إني فاهم فعلًا؟"', '"أعرف إزاي إن المعلومة وصلت فعلًا؟"')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"أعرف إزاي إني فاهم فعلًا؟"%';
-- faq5A
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"كلّمنا على واتساب أو من صفحة التواصل، والرد بيوصلك في نفس اليوم."', '"رسالة على واتساب أو من صفحة التواصل، والرد بيوصلك في نفس اليوم."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"كلّمنا على واتساب أو من صفحة التواصل، والرد بيوصلك في نفس اليوم."%';
-- faq6A
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"تختار كورس صفّك وتمشي بالترتيب: فيديو، وبعده تمرين، وبعده اختبار قصير. الدرس ما بيتقفلش غير لما تخلّص التلاتة."', '"كورس صفّك بيتمشي بالترتيب: فيديو، وبعده تمرين، وبعده اختبار قصير. الدرس ما بيتقفلش غير لما التلاتة يخلصوا."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"تختار كورس صفّك وتمشي بالترتيب: فيديو، وبعده تمرين، وبعده اختبار قصير. الدرس ما بيتقفلش غير لما تخلّص التلاتة."%';
-- faq8A
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"ابدأ بصفحة المصطلحات. اتناشر مصطلح بيتكرروا في أي لغة برمجة، كل واحد متشرح في سطرين بالعربي ومعاه اسمه بالإنجليزي زي ما هتلاقيه في الكود."', '"البداية من صفحة المصطلحات. اتناشر مصطلح بيتكرروا في أي لغة برمجة، كل واحد متشرح في سطرين بالعربي ومعاه اسمه بالإنجليزي زي ما هو في الكود."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"ابدأ بصفحة المصطلحات. اتناشر مصطلح بيتكرروا في أي لغة برمجة، كل واحد متشرح في سطرين بالعربي ومعاه اسمه بالإنجليزي زي ما هتلاقيه في الكود."%';
-- faq9A
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"فيه صفحة لكل صف — الأول والتاني والتالت بكالوريا — وفيها كورسات الصف ده بترتيبها. تدخلها من «كورسات» فوق."', '"فيه صفحة لكل صف — الأول والتاني والتالت بكالوريا — وفيها كورسات الصف ده بترتيبها. والدخول ليها من «كورسات» فوق."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"فيه صفحة لكل صف — الأول والتاني والتالت بكالوريا — وفيها كورسات الصف ده بترتيبها. تدخلها من «كورسات» فوق."%';
-- heroLead
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"منهج البرمجة وعلوم الحاسب كامل، ماشي بترتيب واحد ثابت: تفهم الفكرة، تكتبها كود بنفسك، وتتمتحن عليها في نفس الجلسة."', '"منهج البرمجة وعلوم الحاسب كامل، ماشي بترتيب واحد ثابت: فهم الفكرة، وكتابتها كود بإيدك، وامتحان عليها في نفس الجلسة."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"منهج البرمجة وعلوم الحاسب كامل، ماشي بترتيب واحد ثابت: تفهم الفكرة، تكتبها كود بنفسك، وتتمتحن عليها في نفس الجلسة."%';
-- heroRotating
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"لأول مشروع تكتبه لوحدك."', '"لأول مشروع يتكتب بإيدك لوحدك."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"لأول مشروع تكتبه لوحدك."%';
-- heroRotating
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"لليوم اللي تبطّل تحفظ فيه."', '"لحد اليوم اللي الحفظ ميبقاش له لزوم."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"لليوم اللي تبطّل تحفظ فيه."%';
-- why2Body
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"هتكتب وتشغّل بنفسك من أول درس، مش تستنى لحد ما «تخلّص أساسيات»."', '"كتابة وتشغيل بإيدك من أول درس، من غير انتظار لحد ما «الأساسيات تخلص»."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"هتكتب وتشغّل بنفسك من أول درس، مش تستنى لحد ما «تخلّص أساسيات»."%';
-- why5Title
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"مشروع بيتبني معاك"', '"مشروع بيتبني خطوة بخطوة"')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"مشروع بيتبني معاك"%';
-- why8Body
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"تعرف الفكرة جت منين وليه، وبعد كده تكتبها كود من دماغك."', '"الفكرة بتتشرح جت منين وليه، وبعد كده بتتكتب كود من الدماغ."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"تعرف الفكرة جت منين وليه، وبعد كده تكتبها كود من دماغك."%';
-- whyLeadSecondary
UPDATE app.home_blocks
SET props = REPLACE(props::text, '"ودروسك وتمارينك ونتايجك كلها في مكان واحد، ماشية معاك خطوة ورا خطوة لحد المشروع الأخير."', '"ودروسك وتمارينك ونتايجك كلها في مكان واحد، ماشية خطوة ورا خطوة لحد المشروع الأخير."')::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE props::text LIKE '%"ودروسك وتمارينك ونتايجك كلها في مكان واحد، ماشية معاك خطوة ورا خطوة لحد المشروع الأخير."%';
