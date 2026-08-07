import { z } from 'zod';
import { CatalogCourseDetailSchema, CatalogListSchema, copy } from '@ayman/contracts';
import { PUBLIC_API_ENDPOINTS, absoluteDiscoveryUrl } from '@/lib/agents/discovery';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * `service-desc` — the OpenAPI 3.1 description of the public catalog API.
 *
 * ⚠️ The response schemas are GENERATED from the Zod contracts
 * (`z.toJSONSchema`), never hand-written. This is the entire reason the
 * document is trustworthy: `packages/contracts/src/catalog.ts` is already the
 * allowlist the API's serializer is typed against, so a field that stops being
 * public stops appearing here in the same commit, with no second edit and no
 * chance of describing a field the wire no longer carries.
 *
 * Hand-copying these schemas would have produced a document that is correct on
 * the day it is written and quietly wrong forever after — which is worse than
 * publishing nothing, because an agent has no way to tell.
 *
 * OpenAPI 3.1 is a strict superset of JSON Schema draft 2020-12, so the output
 * drops straight into `components.schemas` with no lossy translation step.
 */

/** `io: 'output'` — what the API RETURNS, which is what a reader of this document wants. */
const jsonSchema = (schema: z.ZodType): Record<string, unknown> =>
  z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' }) as Record<string, unknown>;

const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string(),
  database: z.enum(['up', 'down']),
  /** When this API process booted. Changes on every redeploy, never otherwise. */
  startedAt: z.iso.datetime(),
});

const jsonResponse = (description: string, ref: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } },
});

const summaryOf = (operationId: string): string =>
  PUBLIC_API_ENDPOINTS.find((endpoint) => endpoint.operationId === operationId)?.summary ?? '';

export function GET(): Response {
  const document = {
    openapi: '3.1.0',
    info: {
      title: `${copy.site.platformName} — public catalog API`,
      version: '1.0.0',
      summary: 'Read-only, unauthenticated access to the published course catalog.',
      description: [
        'Everything described here is public, requires no credential of any kind, and returns',
        'no per-user data. It is the same data the marketing site renders.',
        '',
        'What is NOT here: lesson video ids, attachments, quiz questions, attempts, progress and',
        'every admin route. Those need a student session and an active enrolment, they are not',
        'reachable with an API key, and no API key is issued — see /auth.md.',
      ].join('\n'),
      termsOfService: absoluteDiscoveryUrl('authDoc'),
      contact: { name: copy.site.instructor, url: `${SITE_URL}/about` },
    },
    /**
     * This origin, not the Nest host. Single-origin invariant: the API is only
     * ever addressed through `/api/*` on the app origin (`next.config.ts`), and
     * publishing the internal host would hand agents a URL that resolves for
     * nobody and defeats the `__Host-` cookie / zero-CORS arrangement.
     */
    servers: [{ url: SITE_URL }],
    paths: {
      '/api/catalog/courses': {
        get: {
          operationId: 'listCourses',
          summary: summaryOf('listCourses'),
          tags: ['catalog'],
          security: [],
          responses: { '200': jsonResponse('Every published course.', 'CatalogList') },
        },
      },
      '/api/catalog/courses/{slug}': {
        get: {
          operationId: 'getCourse',
          summary: summaryOf('getCourse'),
          tags: ['catalog'],
          security: [],
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              description: "The course's URL slug, as returned by listCourses.",
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': jsonResponse('The course and its full outline.', 'CatalogCourseDetail'),
            // Worth stating: a draft course is indistinguishable from one that
            // never existed, and that is deliberate rather than a gap.
            '404': { description: 'No PUBLISHED course has this slug.' },
          },
        },
      },
      '/api/taxonomy': {
        get: {
          operationId: 'getTaxonomy',
          summary: summaryOf('getTaxonomy'),
          tags: ['taxonomy'],
          security: [],
          responses: { '200': { description: "The curriculum's governorates, systems, tracks and subjects." } },
        },
      },
      '/api/health': {
        get: {
          operationId: 'getHealth',
          summary: summaryOf('getHealth'),
          tags: ['status'],
          security: [],
          responses: { '200': jsonResponse('The API and its database are reachable.', 'Health') },
        },
      },
    },
    components: {
      schemas: {
        CatalogList: jsonSchema(CatalogListSchema),
        CatalogCourseDetail: jsonSchema(CatalogCourseDetailSchema),
        Health: jsonSchema(HealthSchema),
      },
      securitySchemes: {},
    },
    /**
     * An empty top-level `security` is not an oversight — in OpenAPI it is the
     * explicit statement "no authentication is required", which is exactly the
     * fact an agent needs and the one it would otherwise have to guess.
     */
    security: [],
    externalDocs: { url: absoluteDiscoveryUrl('serviceDoc'), description: 'Prose version' },
  };

  return new Response(JSON.stringify(document, null, 2), {
    headers: {
      'Content-Type': 'application/vnd.oai.openapi+json;version=3.1',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
