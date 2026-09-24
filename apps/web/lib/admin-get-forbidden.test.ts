import { describe, expect, it, vi, afterEach } from 'vitest';

/**
 * لوحة مرفوضة مالهاش حق تقتل الصفحة.
 *
 * ## اللي حصل فعلًا
 *
 * `ROLE_PERMISSIONS` في الـAPI بيدي `owner` مجموعة منتقاة عن قصد — الفلوس
 * والمحادثات **بتتمنح** مش افتراضية. يعني على ستاك أي مدرّس، الراوتين دول
 * بيردّوا 403 للشخص اللي المنصة بتاعته، **كل مرة**.
 *
 * وصفحة الطالب كانت بتقراهم جوّه `Promise.all` من غير `catch`، فقراءة واحدة
 * مرفوضة بتاخد الصفحة كلها معاها. اتقاس على الستاكين:
 * `/api/admin/students/{id}` رد 200، و`…/subscriptions` و`…/conversation`
 * ردّوا 403، والشاشة طلعت «حصلت مشكلة» فاضية.
 *
 * ⚠️ التست ده بيقع على الكود اللي كان شغّال.
 */
/* `authHeaders()` بينده `headers()` بتاعة Next، وهي بترمي بره سياق ريكوست.
   اللي بيتحرس هنا هو التعامل مع كود الحالة، مش تمرير الكوكيز. */
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'session=test' }),
}));

const { adminGetOrForbidden, AdminApiError } = await import('./admin-api');

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })));
}

// سكيما بتقبل أي حاجة — اللي بيتحرس هنا هو التعامل مع الحالة، مش التحقق.
const anything = { parse: (v: unknown) => v } as never;

describe('adminGetOrForbidden', () => {
  it('بترجّع null على 403 بدل ما ترمي', async () => {
    respond(403, { statusCode: 403, message: 'Forbidden' });
    await expect(adminGetOrForbidden('/api/admin/x', anything)).resolves.toBeNull();
  });

  it('لسه بترمي على 500 — العطل مش صلاحية', async () => {
    respond(500, { statusCode: 500 });
    await expect(adminGetOrForbidden('/api/admin/x', anything)).rejects.toBeInstanceOf(
      AdminApiError,
    );
  });

  it('لسه بترمي على 404 — الحاجة مش موجودة مش «مش من حقك»', async () => {
    respond(404, { statusCode: 404 });
    await expect(adminGetOrForbidden('/api/admin/x', anything)).rejects.toBeInstanceOf(
      AdminApiError,
    );
  });

  it('بتعدّي الرد الناجح زي ما هو', async () => {
    respond(200, { ok: true });
    await expect(adminGetOrForbidden('/api/admin/x', anything)).resolves.toEqual({ ok: true });
  });

  it('الخطأ بيحمل الـstatus — وده اللي كان ناقص', async () => {
    respond(418, {});
    // من غير `status` على الرمية، المستدعي مايقدرش يفرّق «مرفوض» من «مكسور»
    // غير بتفكيك نص الرسالة — وده سبب وجود الكلاس ده أصلًا للكتابات.
    await expect(adminGetOrForbidden('/api/admin/x', anything)).rejects.toMatchObject({
      status: 418,
    });
  });
});
