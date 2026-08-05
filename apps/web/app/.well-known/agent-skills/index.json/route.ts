import { createHash } from 'node:crypto';
import { AGENT_SKILLS, skillPath } from '@/lib/agents/skills';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * The skills discovery index (Agent Skills Discovery RFC v0.2.0).
 *
 * ⚠️ Every `sha256` is COMPUTED from the bytes this server will actually
 * return for that skill, on the same request. It is not a checksum recorded by
 * hand at authoring time.
 *
 * That matters more than it looks: the digest exists so an agent can verify it
 * fetched the skill it was promised and not something a proxy rewrote. A
 * hardcoded digest goes stale the first time a skill's wording is touched, and
 * a stale digest is WORSE than none — a verifying agent concludes the file has
 * been tampered with and refuses content that is perfectly fine, while a
 * non-verifying agent learns nothing either way. Computing it here means the
 * index cannot lie about the body, in either direction.
 */

/** Must match the digest of the exact bytes `SKILL.md`'s handler writes. */
const sha256 = (body: string): string =>
  createHash('sha256').update(body, 'utf8').digest('hex');

export function GET(): Response {
  const index = {
    $schema: 'https://agentskills.io/schemas/v0.2.0/index.json',
    version: '0.2.0',
    skills: AGENT_SKILLS.map((skill) => ({
      name: skill.name,
      type: 'skill',
      description: skill.description,
      url: `${SITE_URL}${skillPath(skill.name)}`,
      sha256: sha256(skill.body),
    })),
  };

  return new Response(JSON.stringify(index, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
