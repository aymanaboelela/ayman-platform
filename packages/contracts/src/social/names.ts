/**
 * «أحمد محمد علي» → «أحمد م.» — the only form of a student's name a social
 * post carries.
 *
 * The honor board prints full names, on a page the instructor chose to
 * publish them on. A Facebook post is a different audience — reshared, cached
 * by Meta, findable by a stranger searching the name — so the default here is
 * the smallest name that still congratulates a real person: their first name
 * and the initial of the next.
 *
 * Compound first names keep both words, because «عبد م.» is not a name:
 * «عبد الله محمود» → «عبد الله م.», and the same for «أبو» and «أم».
 */
const COMPOUND_HEADS = new Set(['عبد', 'ابو', 'أبو', 'ام', 'أم']);

export function shortStudentName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';

  let first = parts[0]!;
  let rest = parts.slice(1);
  if (COMPOUND_HEADS.has(first) && rest.length > 0) {
    first = `${first} ${rest[0]}`;
    rest = rest.slice(1);
  }

  const next = rest[0];
  if (!next) return first;
  // «السيد» → «س.», not «ا.»: the article is not the name.
  const stem = next.length > 3 && next.startsWith('ال') ? next.slice(2) : next;
  return `${first} ${stem.charAt(0)}.`;
}
