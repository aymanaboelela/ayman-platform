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
