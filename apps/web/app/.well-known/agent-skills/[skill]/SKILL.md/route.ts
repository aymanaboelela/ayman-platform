import { findSkill } from '@/lib/agents/skills';

/**
 * `/.well-known/agent-skills/<name>/SKILL.md`.
 *
 * ⚠️ The body must be returned BYTE-IDENTICAL to what `index.json` hashed —
 * both read `skill.body` and neither post-processes it. Adding a trailing
 * newline, a BOM or a per-request timestamp here would break every digest in
 * the index without changing a single visible character.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ skill: string }> },
): Promise<Response> {
  const { skill: name } = await params;
  const skill = findSkill(name);

  if (!skill) return new Response(null, { status: 404 });

  return new Response(skill.body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
