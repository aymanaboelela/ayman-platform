import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: '__Host-csrf=token' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { replyAction, setStatusAction } = await import('./actions');
const { revalidatePath } = await import('next/cache');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** `204 No Content`, exactly as Nest answers both of these routes. */
function stubNoContent() {
  const spy = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

/**
 * What the instructor experiences when he presses «إرسال الرد».
 *
 * These two actions shipped calling `adminSend`, which ends with
 * `schema.parse(await response.json())` — and `.json()` on a 204's empty body
 * throws AFTER the API has written the reply and notified the student. The
 * button reported failure, kept his text, and skipped the revalidation, so the
 * reply he had just successfully sent did not even appear. He pressed it again.
 *
 * The helper-level distinction is covered in `lib/admin-api.test.ts`. This
 * file asserts the thing he actually touches.
 */
describe('replyAction', () => {
  it('reports success when the route answers 204', async () => {
    stubNoContent();
    await expect(replyAction('c1', 'بكرا باذن الله')).resolves.toEqual({ ok: true });
  });

  it('refreshes both the thread and the list', async () => {
    // Without this the reply is written and the screen still shows the old
    // conversation — indistinguishable, from the desk, from "it did not send".
    stubNoContent();
    await replyAction('c1', 'بكرا باذن الله');

    expect(revalidatePath).toHaveBeenCalledWith('/admin/inbox');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/inbox/c1');
  });

  it('sends the message the instructor typed', async () => {
    const fetchSpy = stubNoContent();
    await replyAction('c1', 'بكرا باذن الله');

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/admin/conversations/c1/reply');
    expect(init.body).toBe(JSON.stringify({ message: 'بكرا باذن الله' }));
  });

  it('reports failure — and does NOT revalidate — when the route rejects it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));

    const result = await replyAction('c1', 'مرحبا');
    expect(result.ok).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects an empty message before it reaches the API', async () => {
    // `ReplySchema` has a minimum length. Caught here, the instructor gets a
    // failed toast; caught nowhere, he gets a 400 that reads like an outage.
    const fetchSpy = stubNoContent();
    const result = await replyAction('c1', '   ');

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('setStatusAction', () => {
  it('closes and reopens through the same 204 route', async () => {
    const fetchSpy = stubNoContent();

    await expect(setStatusAction('c1', 'closed')).resolves.toEqual({ ok: true });
    await expect(setStatusAction('c1', 'open')).resolves.toEqual({ ok: true });

    const bodies = fetchSpy.mock.calls.map(
      (call) => (call as unknown as [string, RequestInit])[1].body,
    );
    expect(bodies).toEqual([
      JSON.stringify({ status: 'closed' }),
      JSON.stringify({ status: 'open' }),
    ]);
  });

  it('refuses a status the contract does not know', async () => {
    // `SetStatusSchema` is an enum of two. `answered` is a real column value
    // the SERVICE sets when he replies — it is deliberately not something the
    // client may ask for, and this proves the boundary rather than assuming it.
    const fetchSpy = stubNoContent();
    const result = await setStatusAction('c1', 'answered' as 'open');

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
