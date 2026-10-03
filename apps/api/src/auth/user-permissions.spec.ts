import {
  PERMISSIONS,
  permissionsForUser,
  roleHasPermission,
  setUserPermissionOverrides,
  userHasPermission,
} from './permissions';

/** خريطة القفل/الفتح بالشكل اللي `PermissionGrantsService` بيبنيه. */
function overrides(entries: Record<string, { allow?: string[]; deny?: string[] }>) {
  return new Map(
    Object.entries(entries).map(([userId, value]) => [
      userId,
      { allow: new Set(value.allow ?? []), deny: new Set(value.deny ?? []) },
    ]),
  );
}

afterEach(() => setUserPermissionOverrides(new Map()));

/**
 * القفل على حساب بعينه — الطبقة اللي بتخلّي «مساعد يعرف يعمل حاجات كتير بس
 * ميشوفش المصروفات» ممكنة أصلًا.
 *
 * قبلها كان فيه طبقتين بس: أساس الرول، ومنح بتفتح عليه. والمساعدين كلهم رول
 * `owner`، وأساسه «كل حاجة إلا المقالات» — يعني مفيش أي مدخل لمساعد محدود.
 */
describe('userHasPermission', () => {
  it('falls back to the role when the account has no overrides', () => {
    expect(userHasPermission('u1', 'owner', 'expense:read')).toBe(
      roleHasPermission('owner', 'expense:read'),
    );
  });

  /* ⚠️ ده الطلب نفسه. */
  it('closes a permission the role baseline would have granted', () => {
    expect(roleHasPermission('owner', 'expense:read')).toBe(true);

    setUserPermissionOverrides(overrides({ u1: { deny: ['expense:read'] } }));

    expect(userHasPermission('u1', 'owner', 'expense:read')).toBe(false);
  });

  /* والقفل على حساب مابيلمسش غيره — ده الفرق بينه وبين القفل على الرول،
     وهو السبب اللي خلّاه لكل حساب من الأساس. */
  it('leaves every other account on the same role untouched', () => {
    setUserPermissionOverrides(overrides({ u1: { deny: ['expense:read'] } }));

    expect(userHasPermission('u1', 'owner', 'expense:read')).toBe(false);
    expect(userHasPermission('u2', 'owner', 'expense:read')).toBe(true);
  });

  it('opens a permission the role baseline withholds', () => {
    const withheld = PERMISSIONS.find((p) => !roleHasPermission('owner', p));
    expect(withheld).toBeDefined();

    setUserPermissionOverrides(overrides({ u1: { allow: [withheld!] } }));

    expect(userHasPermission('u1', 'owner', withheld!)).toBe(true);
  });

  /* «قفلتها» لازم تعني قفلتها. صف قفل موجود = لأ، مهما قال الأساس أو المنح. */
  it('lets deny win over allow on the same permission', () => {
    setUserPermissionOverrides(overrides({ u1: { allow: ['expense:read'], deny: ['expense:read'] } }));

    expect(userHasPermission('u1', 'owner', 'expense:read')).toBe(false);
  });

  /*
   * ⚠️ الجارد اللي بيمنع المدرّس يحبس نفسه برّه منصته.
   *
   * هو `admin` على ستاكه، والرد `true` بييجي **قبل** ما الخريطة تتقري أصلًا.
   * صف قفل على حسابه — سواء اتكتب بالغلط أو اتحقن — مالوش أي أثر. ومن غير
   * ده مفيش شاشة تفتحها تاني، لأن الشاشة نفسها ورا صلاحية.
   */
  it('never closes anything on an admin, even with a deny row', () => {
    setUserPermissionOverrides(overrides({ boss: { deny: ['admin:access', 'expense:read'] } }));

    expect(userHasPermission('boss', 'admin', 'admin:access')).toBe(true);
    expect(userHasPermission('boss', 'admin', 'expense:read')).toBe(true);
    expect(permissionsForUser('boss', 'admin')).toEqual(PERMISSIONS);
  });

  it('holds nothing for an unknown role, override or not', () => {
    setUserPermissionOverrides(overrides({ u1: { allow: ['expense:read'] } }));

    expect(userHasPermission('u1', 'visitor', 'expense:read')).toBe(true);
    expect(userHasPermission('u1', 'visitor', 'settings:write')).toBe(false);
  });
});

/**
 * الليستة اللي الويب بيرسم منها.
 *
 * ⚠️ لازم تتفق مع `userHasPermission` بالحرف. لو الشاشة رسمت زرار الـAPI
 * بترفضه، المساعد بيدوس ويتقال له «مش من حقك»؛ ولو خبّت حاجة الـAPI بتسمح
 * بيها، بيفقد شغله من غير سبب ظاهر.
 */
describe('permissionsForUser', () => {
  it('agrees with userHasPermission on every permission in the catalogue', () => {
    setUserPermissionOverrides(
      overrides({ u1: { deny: ['expense:read', 'payment:read'], allow: ['news:write'] } }),
    );

    const held = new Set(permissionsForUser('u1', 'owner'));
    for (const permission of PERMISSIONS) {
      expect(held.has(permission)).toBe(userHasPermission('u1', 'owner', permission));
    }
  });

  it('drops the closed ones from the list the screen renders', () => {
    const before = permissionsForUser('u1', 'owner');
    expect(before).toContain('expense:read');

    setUserPermissionOverrides(overrides({ u1: { deny: ['expense:read'] } }));

    expect(permissionsForUser('u1', 'owner')).not.toContain('expense:read');
  });

  /* الترتيب ترتيب الكتالوج — الشاشة بترسم بيه، وفتح صلاحية مالازمش يقلبه. */
  it('keeps the catalogue order', () => {
    setUserPermissionOverrides(overrides({ u1: { allow: ['news:write'] } }));

    const held = permissionsForUser('u1', 'owner');
    const catalogueOrder = PERMISSIONS.filter((p) => held.includes(p));
    expect(held).toEqual(catalogueOrder);
  });
});

/**
 * الحساب اللي ينفع يتظبط من الشاشة دي.
 *
 * ⚠️ التستات دي اتكتبت بعد ما **مصفوفة الصلاحيات كشفت الحتة**: صف فيها كتب
 * `permissions: []` على حساب **طالب**، فاتكتبله «اقفل» لكل حاجة في أساسه،
 * وإحدى عشر تست بعده وقعوا بـ403 لأن الطالب اتسحبت منه صلاحياته.
 *
 * على البرودكشن ده كان طالب دافع بيتقفل عليه حسابه من غير أي شاشة تقول ليه،
 * ومن غير أي خطأ في أي لوج.
 */
describe('replaceForUser — مين ينفع يتظبط', () => {
  /* الدالة دي منطق خالص، فالتست بيستدعي نفس الشروط من غير داتابيز. */
  function guard(role: string): string | null {
    if (role === 'admin') return 'حساب الأدمن بياخد كل الصلاحيات، والقفل عليه مالوش أثر';
    if (role !== 'owner') return 'الصلاحيات دي بتتظبط لحسابات الفريق بس';
    return null;
  }

  it('refuses a student account', () => {
    expect(guard('student')).toBe('الصلاحيات دي بتتظبط لحسابات الفريق بس');
  });

  it('refuses an admin account', () => {
    expect(guard('admin')).toContain('الأدمن');
  });

  it('allows a staff account', () => {
    expect(guard('owner')).toBeNull();
  });
});

/**
 * التصعيد — «مفيش حد يدّي حاجة هو نفسه مش ماسكها».
 *
 * ⚠️ ده كان باب مفتوح على الآخر، ومكانه بالظبط اللي بيخلّيه خطير: المدرّس
 * محجوب عنه `role:grant` و`news:write` و`student:role-change`
 * (`OWNER_WITHHELD`)، بس ماسك `staff:manage` — فكان يقدر يفتحهم **لمساعده**،
 * والمساعد يعمل اللي هو ممنوع منه.
 *
 * و`role:grant` أوحشهم: المساعد بعدها يفتح أي صلاحية لأي رول، والأساس كله في
 * `permissions.ts` يبقى ديكور.
 */
describe('replaceForUser — التصعيد', () => {
  /* نفس منطق الفحص اللي في الخدمة، من غير داتابيز. */
  function escalating(
    wanted: readonly string[],
    baseline: readonly string[],
    actorHolds: readonly string[],
  ): string[] {
    const base = new Set(baseline);
    const actor = new Set(actorHolds);
    return wanted.filter((permission) => !base.has(permission) && !actor.has(permission));
  }

  it('refuses to open a permission the writer does not hold', () => {
    // المدرّس مش ماسك `role:grant`، وبيحاول يفتحها لمساعده.
    expect(escalating(['role:grant'], ['course:read'], ['staff:manage', 'course:read'])).toEqual([
      'role:grant',
    ]);
  });

  it('allows opening a permission the writer does hold', () => {
    expect(escalating(['expense:read'], ['course:read'], ['expense:read'])).toEqual([]);
  });

  it('never blocks a withhold — taking access away is not escalation', () => {
    /*
     * الأساس فيه `news:write` والطلب مافيهوش، يعني قفل. الفحص على الفتح بس،
     * فمابيلمسش الحالة دي — حتى لو اللي بيكتب مش ماسك `news:write` أصلًا.
     */
    expect(escalating([], ['news:write'], [])).toEqual([]);
  });

  it('lets the baseline through even when the writer lacks it', () => {
    /*
     * صلاحية في أساس الرول ومش مع اللي بيكتب: مش فتح جديد، دي حالة الحساب
     * الطبيعية. لو الفحص رماها كان أي حفظ بيقع على مساعد اتقفل عليه قسم.
     */
    expect(escalating(['news:write'], ['news:write'], [])).toEqual([]);
  });
});

/**
 * `admin:access` — عملية حقيقية، صبري (2026-10-02): علّم «رد على المحادثات +
 * مراجعة الدفعات + الإحصائيات» بس من شاشة `/admin/roles`، ونسي يفتح قسم
 * «النظام» اللي `admin:access` متحطّة جواه — ومش غريب إنه نساها، هي قاعدة
 * جنب `settings:write` و`role:grant`، حاجات تخوّف أي حد بيدي مساعد صلاحيات
 * محدودة فيبعد عنها.
 *
 * النتيجة: المساعد كان ياخد 404 على أي صفحة `/admin/*` يحاول يفتحها، حتى
 * اللي صلاحياتها معاه فعلًا — لأن `(admin)/layout.tsx` بيتأكد من
 * `admin:access` قبل أي حاجة تانية خالص. صلاحية بس من غيرها مفيش طريقة
 * تتستخدم بيها، فمفيش قرار حقيقي بيتاخد لما حد يسيبها من غير قصد.
 */
describe('replaceForUser — admin:access بتتضاف تلقائي', () => {
  /* نفس منطق الخدمة بالحرف — انظر `replaceForUser` في
     `permission-grants.service.ts`. */
  function withForcedAdminAccess(wanted: readonly string[]): string[] {
    const set = new Set(wanted);
    if (set.size > 0) set.add('admin:access');
    return [...set];
  }

  it('بتتضاف لو فيه أي صلاحية تانية، حتى لو محدش علّمها بنفسه', () => {
    const saved = withForcedAdminAccess(['conversation:read', 'conversation:reply', 'payment:read']);
    expect(saved).toContain('admin:access');
  });

  it('بتفضل فاضية لو القرار قفل الحساب كله — ده مش نسيان', () => {
    expect(withForcedAdminAccess([])).toEqual([]);
  });

  it('مابتتكررش لو كانت متحطّة أصلًا', () => {
    const saved = withForcedAdminAccess(['admin:access', 'analytics:read']);
    expect(saved.filter((permission) => permission === 'admin:access')).toHaveLength(1);
  });
});

/**
 * صاحب الستاك — «أقدم حساب مش-طالب».
 *
 * ⚠️ القاعدة دي موجودة عشان على ستاكات المدرّسين التانيين المدرّس والمساعد
 * **نفس الرول** (`owner`)، والمساعد بياخد `staff:manage` في أساسه. يعني أول
 * مساعد يتضاف كان يقدر يقفل على المدرّس — ومفيش حساب `admin` هناك يرجّعه.
 *
 * اتقاس على الحي: عادل وصبري عندهم **حساب واحد بس، رولُه `owner`**.
 */
describe('founder — مين ماينفعش يتقفل عليه', () => {
  interface Account {
    id: string;
    role: string;
    createdAt: string;
  }

  /* نفس منطق الاستعلام: أقدم حساب مش-طالب. */
  function founderOf(accounts: readonly Account[]): string | null {
    const staff = accounts
      .filter((a) => a.role !== 'student')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return staff[0]?.id ?? null;
  }

  it('picks the teacher, not the assistant added later', () => {
    expect(
      founderOf([
        { id: 'assistant', role: 'owner', createdAt: '2026-09-01' },
        { id: 'teacher', role: 'owner', createdAt: '2026-01-01' },
      ]),
    ).toBe('teacher');
  });

  it('ignores students, however old their account is', () => {
    /*
     * ⚠️ من غير الفلتر ده، أقدم طالب مسجّل (٢٠٢٥) كان هيبقى «صاحب الستاك»،
     * والمدرّس الحقيقي يفضل مكشوف.
     */
    expect(
      founderOf([
        { id: 'old-student', role: 'student', createdAt: '2025-01-01' },
        { id: 'teacher', role: 'owner', createdAt: '2026-01-01' },
      ]),
    ).toBe('teacher');
  });

  it('is the admin on a stack that has one', () => {
    // منصة أيمن: حسابين أدمن. الأقدم فيهم هو صاحب الستاك.
    expect(
      founderOf([
        { id: 'admin-2', role: 'admin', createdAt: '2026-05-01' },
        { id: 'admin-1', role: 'admin', createdAt: '2024-01-01' },
      ]),
    ).toBe('admin-1');
  });

  it('is nobody on a stack with no staff yet', () => {
    expect(founderOf([{ id: 's', role: 'student', createdAt: '2025-01-01' }])).toBeNull();
  });
});
