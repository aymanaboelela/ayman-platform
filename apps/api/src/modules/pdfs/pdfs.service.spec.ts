import { PdfsService } from './pdfs.service';

const ROW = {
  id: '01a17076-7dd5-719f-b9c7-e6a76dfa5e43',
  slug: 'ملخص',
  title: 'ملخص الوحدة الأولى',
  description: 'وصف قصير للملف ده يكفي عشرين حرف',
  category: 'summary',
  year: 2,
  coverKey: null,
  sizeBytes: 1024,
  pageCount: 12,
  downloads: 3,
  publishedAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
};

function makeService() {
  const prisma = {
    pdfFile: {
      findMany: jest.fn(async () => [] as unknown[]),
      findFirst: jest.fn(async () => null as unknown),
      updateManyAndReturn: jest.fn(async () => [] as unknown[]),
    },
  };
  const audit = { record: jest.fn() };
  return { service: new PdfsService(prisma as never, audit as never), prisma };
}

describe('PdfsService — a draft is invisible', () => {
  it('filters the public list on published in the WHERE clause', async () => {
    const { service, prisma } = makeService();
    await service.listPublic();
    expect(prisma.pdfFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'published' } }),
    );
  });

  it('filters the public page on published, and returns null for anything else', async () => {
    const { service, prisma } = makeService();
    expect(await service.findPublicBySlug('draft-one')).toBeNull();
    expect(prisma.pdfFile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'draft-one', status: 'published' } }),
    );
  });

  it('counts and serves a download only for a published row, in one statement', async () => {
    const { service, prisma } = makeService();
    expect(await service.startDownload('draft-one')).toBeNull();
    expect(prisma.pdfFile.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'draft-one', status: 'published' },
        data: { downloads: { increment: 1 } },
      }),
    );
  });
});

describe('PdfsService — «ملفات كمان»', () => {
  it('puts the same year first and caps the row at four', async () => {
    const { service, prisma } = makeService();
    prisma.pdfFile.findFirst.mockResolvedValueOnce({ ...ROW, body: '' });
    prisma.pdfFile.findMany.mockResolvedValueOnce([
      { ...ROW, id: 'a', slug: 'a', year: 1 },
      { ...ROW, id: 'b', slug: 'b', year: 2 },
      { ...ROW, id: 'c', slug: 'c', year: null },
      { ...ROW, id: 'd', slug: 'd', year: 2 },
      { ...ROW, id: 'e', slug: 'e', year: 1 },
    ]);

    const detail = await service.findPublicBySlug(ROW.slug);

    expect(detail?.related.map((pdf) => pdf.slug)).toEqual(['b', 'd', 'a', 'c']);
  });
});
