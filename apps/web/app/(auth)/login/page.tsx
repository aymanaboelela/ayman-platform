import Link from 'next/link';
import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: copy.auth.login.title };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.auth.login.title}</CardTitle>
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.auth.login.subtitle}
        </p>
      </CardHeader>
      <CardBody className="space-y-6">
        <LoginForm />
        <p className="text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.auth.switch.noAccount}{' '}
          <Link href="/register" className="text-accent-text hover:underline">
            {copy.auth.switch.createAccount}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
