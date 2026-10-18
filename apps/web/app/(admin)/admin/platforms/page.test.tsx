import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The control plane's own lock (`page.tsx`, «The page checks the owner
 * itself»). The admin layout's role check never runs for an RSC request whose
 * router-state header claims the layout is already on screen, so each part of
 * this screen that reads Dokploy or Cloudflare with the server's keys must
 * refuse a caller who is not the owner by itself.
 */
const isControlPlaneOwner = vi.fn();
const tenantList = vi.fn();
const tenantVideoUsage = vi.fn();

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
  },
}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@/lib/provisioning/gate', () => ({ isControlPlaneOwner: () => isControlPlaneOwner() }));
vi.mock('@/lib/provisioning/tenants', () => ({ tenantList: () => tenantList() }));
vi.mock('@/lib/provisioning/dokploy', () => ({ dokployConfigured: () => true }));
vi.mock('@/lib/provisioning/cloudflare', () => ({ cloudflareConfigured: () => true }));
vi.mock('@/lib/control-plane', () => ({ controlPlaneTenants: () => [{ key: 'mohamed-sabry', name: 'م. محمد صبري' }] }));
vi.mock('@/lib/video-usage', () => ({ tenantVideoUsage: (...args: unknown[]) => tenantVideoUsage(...args) }));
vi.mock('./platforms-form', () => ({ PlatformsForm: () => null }));
vi.mock('./tenants-section', () => ({ NewTeacherLink: () => null, TenantsSection: () => null }));
vi.mock('./new/new-teacher-form', () => ({ NewTeacherForm: () => null }));

const { default: PlatformsPage } = await import('./page');
const { default: NewTeacherPage } = await import('./new/page');
const { VideoUsage } = await import('./video-usage');
const { VideoUsageOverview } = await import('../video-usage-overview');

afterEach(() => {
  vi.clearAllMocks();
});

describe('the control plane, for anyone but the owner', () => {
  it('answers not-found for the screen and for «مدرّس جديد»', async () => {
    isControlPlaneOwner.mockResolvedValue(false);
    await expect(PlatformsPage()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    await expect(NewTeacherPage()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(tenantList).not.toHaveBeenCalled();
  });

  it('never reads Cloudflare from the parts rendered on their own', async () => {
    isControlPlaneOwner.mockResolvedValue(false);
    expect(await VideoUsage({ tenants: [{ key: 'mohamed-sabry', name: 'م. محمد صبري' }] })).toBeNull();
    expect(await VideoUsageOverview()).toBeNull();
    expect(tenantVideoUsage).not.toHaveBeenCalled();
  });
});

describe('the control plane, for the owner', () => {
  it('renders the screen and reads the video bill', async () => {
    isControlPlaneOwner.mockResolvedValue(true);
    await expect(PlatformsPage()).resolves.toBeTruthy();
    tenantVideoUsage.mockResolvedValue({ ok: false, reason: 'not-configured' });
    expect(await VideoUsage({ tenants: [] })).not.toBeNull();
    expect(tenantVideoUsage).toHaveBeenCalledTimes(1);
  });
});
