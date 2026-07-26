import { Badge, Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';

// cacheComponents is on, so this render is dynamic unless explicitly cached.
// Taxonomy is a good future 'use cache' candidate; leaving it live here proves
// the request actually reaches Postgres on every load.
export default async function TaxonomyPage() {
  const taxonomy = await apiGet('/api/taxonomy', TaxonomySchema);

  const pinned = taxonomy.governorates.filter((g) =>
    taxonomy.pinnedGovernorateCodes.includes(g.code),
  );
  const rest = taxonomy.governorates.filter(
    (g) => !taxonomy.pinnedGovernorateCodes.includes(g.code),
  );

  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <p className="eyebrow mb-2">02 / التصنيف</p>
      <h1 className="mb-8 text-[length:var(--fs-title-1)] font-semibold">
        {copy.onboarding.governorate} والنظام الدراسي
      </h1>

      <section className="mb-12">
        <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium">
          {copy.onboarding.governoratePlaceholder}
        </h2>
        <div className="flex flex-wrap gap-2">
          {pinned.map((g) => (
            <Badge key={g.code} tone="accent">
              {g.nameAr}
            </Badge>
          ))}
          {rest.map((g) => (
            <Badge key={g.code}>{g.nameAr}</Badge>
          ))}
        </div>
        <p className="mono mt-3 text-[length:var(--fs-mono-label)] text-fg-muted">
          {taxonomy.governorates.length} محافظة
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {taxonomy.systems.map((system) => (
          <Card key={system.id}>
            <CardHeader className="flex items-center justify-between gap-3">
              <CardTitle>{system.nameAr}</CardTitle>
              <span className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                {system.totalMarks} درجة · {system.passPercent}%
              </span>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <p className="eyebrow mb-2">الصفوف</p>
                <ul className="space-y-1">
                  {system.years.map((year) => (
                    <li key={year.year} className="flex items-center justify-between">
                      <span>{year.labelAr}</span>
                      <Badge tone={year.badgeAr === 'سنة شهادة' ? 'warn' : 'neutral'}>
                        {year.badgeAr}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow mb-2">{copy.onboarding.track}</p>
                <ul className="space-y-1 text-fg-muted">
                  {system.tracks.map((track) => (
                    <li key={track.id}>{track.labelAr}</li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>
        ))}
      </section>
    </main>
  );
}
