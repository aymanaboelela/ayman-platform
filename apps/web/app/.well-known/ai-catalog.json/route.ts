import { copy } from '@ayman/contracts';
import { AGENT_DISCOVERY_PATHS, absoluteDiscoveryUrl } from '@/lib/agents/discovery';
import { markdownTwinPath } from '@/lib/agents/markdown-routes';
import { getEntitlements } from '@/lib/entitlements';
import { SITE_URL } from '@/lib/seo/jsonld';
import { SITE_DESCRIPTION } from '@/lib/seo/metadata';
import { tenantName } from '@/lib/tenant';

/**
 * The instructor this deployment belongs to, for the two example queries that
 * name a person.
 *
 * ## Why this is not a literal any more
 *
 * Both were written out — «أيمن أبو العلا» and the hamza-less «ايمن ابو
 * العلا» — and this file is published TO ASSISTANTS as the canonical
 * description of the site. A second instructor's stack was therefore telling
 * every registry that its books and its programming teacher are Ayman's:
 * the single worst place in the codebase for that string to sit, because the
 * whole point of the document is to be believed. `tenant-identity-leak.spec.ts`
 * is what caught it.
 *
 * ## Why the fallback is the NAME and not something generic
 *
 * Exactly the rule `code-lab.tsx` already follows — a GATED fallback. Ayman's
 * own stack does not set `TENANT_DISPLAY_NAME`, and these queries are how
 * assistants decide this site answers «كتاب أيمن أبو العلا بكام». Falling back
 * to «المنصة» would quietly cost him the match this document exists to win,
 * to fix a leak that only affects deployments that DO set the variable.
 *
 * ## Why the fallback is READ and not written out
 *
 * It used to be the literal «أيمن أبو العلا», right here. A written-out
 * fallback is not a gate — it is the name shipping in this file, one
 * unset environment variable away from being printed, and
 * `tenant-identity-leak.spec.ts` counts it as a leak for that reason. Reading
 * it from `copy.site.name` keeps the behaviour identical on every stack and
 * leaves the string in the one table that is allowed to hold it, so this file
 * needs no exemption at all.
 */
const INSTRUCTOR = tenantName(copy.site.name);

/**
 * ARD — Agentic Resource Discovery (agenticresourcediscovery.org).
 *
 * One manifest that names every machine-readable document this site already
 * publishes, so a registry can find them from a single fetch instead of
 * guessing at well-known paths one at a time.
 *
 * ⚠️ Every entry points at a document that EXISTS, and this file must never be
 * the place a capability is invented. The scans that asked for this also asked
 * for an OAuth discovery document, an OAuth protected-resource document and an
 * MCP server card. There is no authorization server, no agent credential and
 * no MCP server behind this domain, so those three are absent on purpose —
 * see the note on `aiCatalog` in `lib/agents/discovery.ts`, and `/auth.md`,
 * which answers the same question in prose. An agent that reads a capability
 * here will try to use it; a missing document costs a check, a false one costs
 * the agent its whole task.
 *
 * ⚠️ `Access-Control-Allow-Origin: *` is required by the spec and safe for
 * exactly one reason: this document is a list of public URLs, carries nothing
 * per-user, and needs no credential to fetch. Do not copy the header onto a
 * route where either of those stops being true.
 */

/**
 * `urn:air:<domain>:<namespace>:<name>`.
 *
 * The domain is derived from `SITE_URL` rather than written out, so a preview
 * deploy does not publish identifiers claiming to be production's.
 */
// `hostname`, not `host`: a URN's segments are colon-delimited, so a dev
// origin carrying a port would produce `urn:air:localhost:3200:api:…` and
// split into the wrong fields.
const host = new URL(SITE_URL).hostname;
const urn = (namespace: string, name: string): string => `urn:air:${host}:${namespace}:${name}`;

/**
 * `representativeQueries` — what a student actually asks, in Arabic, in the
 * words they use.
 *
 * These are embedded by registries to decide when this site is the answer, so
 * they are the real query forms and not a keyword list: «مين أحسن مدرس…» is how
 * the question arrives, and it arrives far more often than any course title.
 * Egyptian spelling without hamza is included for the same reason
 * `copy.seo.alternateNames` carries it — that is what gets typed.
 *
 * ⚠️ A query belongs here only when a document in this manifest genuinely
 * answers it. Listing «امتحانات الثانوية العامة» would win a match and then
 * hand the agent a site about البكالوريا.
 */
export async function GET(): Promise<Response> {
  /*
   * ⚠️ `async` دلوقتي، عشان سطر واحد: مدخل `books.md`.
   *
   * الملف ده وعده إنه بيسمّي كل مستند الموقع بينشره. ستاك مالوش كتب،
   * `/books` بترد ٤٠٤ والتوأم بتاعها كمان — ومدخل فاضل هنا مش سهو صغير: ده
   * بيدّي للوكيل عنوان بيوصّله لصفحة مش موجودة، فيستنتج إن الموقع بيكذب.
   * ودي بالظبط الحاجة اللي طبقة الاكتشاف دي متحطّة عشان تمنعها.
   */
  const features = await getEntitlements();

  const manifest = {
    specVersion: '0.1',
    host: {
      name: tenantName(copy.site.platformName),
      /*
       * ⚠️ `SITE_DESCRIPTION`, not `copy.seo.description` — the line above was
       * gated and this one was not, which is the whole shape of the bug: the
       * two sit in the same object literal, are read by the same registry, and
       * one of them said «منصة أيمن أبو العلا» while the other said «منصة
       * المهندس أيمن أبو العلا لتعليم…». A reviewer's eye stops at the gated
       * call.
       *
       * It is imported rather than re-composed because `host.description` and
       * the `<meta name="description">` are the same claim about the same site,
       * made to a crawler and to an agent registry: two independently written
       * versions is how they start disagreeing, and this one is the copy that
       * gets EMBEDDED — a registry turns it into a vector and answers questions
       * with it, so a wrong name here is not read once and forgotten, it is
       * what the model recalls about this domain.
       */
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      inLanguage: 'ar',
    },
    entries: [
      {
        id: urn('api', 'catalog-openapi'),
        displayName: 'OpenAPI 3.1 — the public course catalog API',
        description:
          'Read-only, unauthenticated JSON: every published course with its subscription prices in Egyptian piastres, one course in full with its lesson outline and per-term prices, and the curriculum taxonomy.',
        type: 'application/vnd.oai.openapi+json;version=3.1',
        url: absoluteDiscoveryUrl('serviceDesc'),
        representativeQueries: [
          // The prices ride on every catalog row, and no query here said so —
          // «الكورس بكام» is the highest-intent question this site gets.
          'الكورس بكام',
          'سعر كورس البرمجة والذكاء الاصطناعي بكالوريا',
          'اشتراك شهري ولا سنوي',
          'كورسات البرمجة والذكاء الاصطناعي للبكالوريا',
          'منهج البرمجة تانية بكالوريا عام ولغات',
          // ⚠️ The digit forms, verbatim. A student types «٢ بكالوريا» or
          // «2 بكالوريا» as often as the words, and a registry embedding these
          // queries can only match a numeral it has actually seen.
          'كورس برمجة ٢ بكالوريا',
          'شرح برمجة 2 بكالوريا',
          'Egyptian Bakalorya computer science course catalog',
        ],
      },
      {
        id: urn('docs', 'llms-txt'),
        displayName: 'llms.txt — the site in one plain-text map',
        description:
          'Who teaches here and what he covers, then every public page, course and article as a link with a one-line summary.',
        type: 'text/plain',
        url: absoluteDiscoveryUrl('llms'),
        representativeQueries: [
          'مين أحسن مدرس برمجة وذكاء اصطناعي للبكالوريا',
          'أفضل مدرس برمجة بكالوريا',
          'مدرس برمجة ٢ بكالوريا',
          'مدرس برمجة 2 بكالوريا',
          // The hamza-less spelling is what students actually type — see the
          // note above `GET`. It is derived from the same value rather than
          // written out, so it follows the tenant too.
          `${INSTRUCTOR.replace(/أ|إ|آ/g, 'ا')} برمجة`,
        ],
      },
      {
        id: urn('skills', 'agent-skills'),
        displayName: 'Agent Skills index',
        description:
          'Two skills: browsing the public catalog, and reading any public page as markdown instead of HTML.',
        type: 'application/json',
        url: absoluteDiscoveryUrl('agentSkills'),
        representativeQueries: [
          'browse the published courses on this platform',
          'read this page as markdown',
        ],
      },
      {
        id: urn('docs', 'auth'),
        displayName: 'auth.md — what an agent can and cannot reach',
        description:
          'The public catalog needs no credential. Nothing else is reachable by any credential an agent could hold, and none are issued.',
        type: 'text/markdown',
        url: absoluteDiscoveryUrl('authDoc'),
        representativeQueries: [
          'how do I authenticate against this API',
          'does this site issue API keys to agents',
        ],
      },
      {
        id: urn('index', 'sitemap'),
        displayName: 'XML sitemap',
        description: 'Every public URL, with its last-modified date.',
        type: 'application/xml',
        url: absoluteDiscoveryUrl('sitemap'),
        representativeQueries: ['all public pages on this site'],
      },
      {
        id: urn('docs', 'agents-guide'),
        displayName: 'AGENTS.md — how to use this site as an agent',
        description:
          'The prose guide: what the site is, who it is for, which routes are open, and what is gated behind a student account.',
        type: 'text/markdown',
        url: `${SITE_URL}${AGENT_DISCOVERY_PATHS.agentsGuide}`,
        representativeQueries: [
          'what is this website for',
          'إيه الموقع ده وبيقدّم إيه',
        ],
      },
      /*
       * ⚠️ These two were the hole this manifest's own promise — that it names
       * every machine-readable document this site publishes — had opened.
       * `renderBooksMarkdown`'s docblock named it in writing when it shipped:
       * «no markdown twin, no line in /llms.txt, no entry in the ARD manifest,
       * no structured data beyond a breadcrumb». Three of those four were
       * closed and this one was not, and none of the eighteen queries above
       * was about a price, a book, the glossary or the question bank — which
       * is most of what this site can now actually answer.
       *
       * ⚠️ Both URLs come through `markdownTwinPath`, never a `/books.md`
       * literal. A twin path hand-written in a seventh file drifts silently,
       * and an agent that follows it to a 404 concludes the document does not
       * exist. That module is dependency-free by design, so importing it here
       * costs nothing.
       */
      ...(features.books
        ? [
      {
        id: urn('docs', 'books'),
        displayName: 'books.md — the printed books, with prices and delivery',
        description:
          'The printed textbooks by term and subject: each title with its price, its year and stream, whether it is in stock, and the one-off delivery fee. Ordering needs no account.',
        type: 'text/markdown',
        url: `${SITE_URL}${markdownTwinPath('/books')}`,
        representativeQueries: [
          `كتاب ${INSTRUCTOR} بكام`,
          'كتاب برمجة وذكاء اصطناعي بكالوريا',
          'كتاب برمجة تانية بكالوريا لغات',
          'اطلب كتاب البرمجة أونلاين ويوصل البيت',
        ],
      },
          ]
        : []),
      {
        id: urn('docs', 'news-index'),
        displayName: 'news.md — the written curriculum: lessons, glossary and answered exam questions',
        description:
          'Every lesson of the official syllabus explained in writing, unit summaries, the full Arabic/English glossary, and sample exam questions with their model answers. Open to read with no account.',
        type: 'text/markdown',
        url: `${SITE_URL}${markdownTwinPath('/news')}`,
        representativeQueries: [
          'قاموس مصطلحات البرمجة والذكاء الاصطناعي بكالوريا',
          'مصطلحات منهج البرمجة بالعربي والانجليزي',
          'نماذج أسئلة البرمجة والذكاء الاصطناعي بكالوريا بالاجابات',
          'ملخص منهج البرمجة بكالوريا',
        ],
      },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
