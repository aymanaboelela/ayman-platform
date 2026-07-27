import Link from 'next/link';
import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = { title: copy.auth.register.title };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.auth.register.title}</CardTitle>
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.auth.register.subtitle}
        </p>
      </CardHeader>
      <CardBody className="space-y-6">
        <RegisterForm />
        <p className="text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.auth.switch.haveAccount}{' '}
          <Link href="/login" className="text-accent-text underline">
            {copy.auth.switch.login}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
