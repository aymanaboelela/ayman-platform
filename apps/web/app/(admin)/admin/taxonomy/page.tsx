import Link from 'next/link';
import { Card, CardBody } from '@ayman/ui';
import { copy } from '@ayman/contracts';

export const metadata = { title: copy.admin.taxonomy.title };

const SECTIONS = [
  { href: '/admin/taxonomy/governorates', label: () => copy.admin.taxonomy.governoratesTitle },
  { href: '/admin/taxonomy/systems', label: () => copy.admin.taxonomy.systemsTitle },
  { href: '/admin/taxonomy/tracks', label: () => copy.admin.taxonomy.tracksTitle },
  { href: '/admin/taxonomy/subjects', label: () => copy.admin.taxonomy.subjectsTitle },
] as const;

export default function TaxonomyIndexPage() {
  return (
    <>
      <h1 className="mb-4 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.taxonomy.title}
      </h1>
      <p className="mb-24 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.taxonomy.lead}</p>

      <div className="grid grid-cols-1 gap-16 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className="block">
            <Card className="transition-colors duration-150 hover:border-line-strong">
              <CardBody>
                <span className="font-[var(--fw-medium)] text-fg">{section.label()}</span>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
