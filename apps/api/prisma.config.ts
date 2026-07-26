// Prisma 7 moved configuration out of package.json#prisma into this file, and
// stopped auto-loading .env — both are handled here. It also dropped
// datasource `url`/`directUrl` from schema.prisma entirely: the CLI (migrate,
// db push, etc.) now reads its connection string from here instead. Migrate
// needs DDL rights, so this points at DIRECT_DATABASE_URL (ayman_owner) — the
// running app never uses this file; it connects via the adapter in
// PrismaService using DATABASE_URL (ayman_runtime, DML only).
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

type Env = {
  DIRECT_DATABASE_URL: string;
};

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env<Env>('DIRECT_DATABASE_URL'),
  },
});
