import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminTaxonomyService } from './admin-taxonomy.service';

function makeService() {
  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };
  const prisma = {
    governorate: {
      findUnique: jest.fn(async () => ({ code: '01', nameAr: 'القاهرة', isActive: true })),
      update: jest.fn(async (args: { data: unknown }) => ({ code: '01', ...args.data as object })),
    },
    educationSystem: {
      findUnique: jest.fn(async () => ({ id: 's1', passPercent: 50, totalMarks: 300 })),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 's1',
        passPercent: 50,
        totalMarks: 300,
        ...args.data,
      })),
    },
    academicYear: {
      findUnique: jest.fn(async () => ({ id: 'y1', labelAr: 'الأول' })),
      update: jest.fn(async () => ({ id: 'y1' })),
    },
    track: {
      create: jest.fn(async (args: { data: unknown }) => ({ id: 't1', ...args.data as object })),
      findUnique: jest.fn(async () => ({ id: 't1', labelAr: 'علمي' })),
      update: jest.fn(async () => ({ id: 't1' })),
    },
    subject: {
      create: jest.fn(async (args: { data: unknown }) => ({ id: 'sub1', ...args.data as object })),
      findUnique: jest.fn(async () => ({ id: 'sub1', nameAr: 'رياضيات' })),
      update: jest.fn(async () => ({ id: 'sub1' })),
      delete: jest.fn(async () => ({ id: 'sub1' })),
    },
    subjectOffering: {
      create: jest.fn(async (args: { data: unknown }) => ({ id: 'off1', ...args.data as object })),
      findUnique: jest.fn(async () => ({ id: 'off1', year: 2, trackId: 't1' })),
      update: jest.fn(async () => ({ id: 'off1' })),
    },
  };
  return { service: new AdminTaxonomyService(prisma as never, audit as never), prisma, audit };
}

describe('AdminTaxonomyService.patchGovernorate', () => {
  it('writes one taxonomy:update audit entry', async () => {
    const { service, audit } = makeService();
    await service.patchGovernorate('01', { isActive: false });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'taxonomy:update',
      resourceType: 'taxonomy',
      resourceId: 'governorate:01',
    });
  });

  it('throws not found for a nonexistent code', async () => {
    const { service, prisma } = makeService();
    prisma.governorate.findUnique.mockResolvedValueOnce(null);
    await expect(service.patchGovernorate('99', { isActive: false })).rejects.toThrow(NotFoundException);
  });
});

describe('AdminTaxonomyService.patchSystem', () => {
  it('audits before/after when passPercent or totalMarks changes', async () => {
    const { service, audit } = makeService();
    await service.patchSystem('s1', { passPercent: 60 });
    expect(audit.record.mock.calls[0][0].metadata).toMatchObject({
      before: { passPercent: 50, totalMarks: 300 },
      after: { passPercent: 60, totalMarks: 300 },
    });
  });

  it('does not attach before/after when neither field changes', async () => {
    const { service, audit } = makeService();
    await service.patchSystem('s1', { nameAr: 'اسم جديد' });
    expect(audit.record.mock.calls[0][0].metadata.before).toBeUndefined();
  });
});

describe('AdminTaxonomyService.deleteSubject', () => {
  it('reports a foreign-key violation as 409, not a raw 500', async () => {
    const { service, prisma } = makeService();
    prisma.subject.delete.mockRejectedValueOnce({ code: 'P2003' });
    await expect(service.deleteSubject('sub1')).rejects.toThrow(ConflictException);
  });

  it('deletes and audits when nothing references the subject', async () => {
    const { service, audit } = makeService();
    await service.deleteSubject('sub1');
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'taxonomy:archive' });
  });
});

describe('AdminTaxonomyService.patchSubjectOffering', () => {
  it('rejects a patch that would leave a year-1 offering scoped to a track', async () => {
    const { service, prisma } = makeService();
    prisma.subjectOffering.findUnique.mockResolvedValueOnce({ id: 'off1', year: 2, trackId: 't1' });
    await expect(service.patchSubjectOffering('off1', { year: 1 })).rejects.toThrow(BadRequestException);
  });

  it('allows clearing the track in the same patch that sets year to 1', async () => {
    const { service, prisma } = makeService();
    prisma.subjectOffering.findUnique.mockResolvedValueOnce({ id: 'off1', year: 2, trackId: 't1' });
    await expect(service.patchSubjectOffering('off1', { year: 1, trackId: null })).resolves.toBeDefined();
  });
});
