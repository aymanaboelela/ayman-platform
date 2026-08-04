import { copy } from '@ayman/contracts';

const e = copy.essentials;

/**
 * The twelve terms, in one place.
 *
 * They used to be a `const` inside `(site)/essentials/page.tsx`. The signed-in
 * surface needs the same twelve — a student who wants to look up "what is a
 * loop again" should not be thrown out of their dashboard onto a marketing
 * page to read it — and two copies of a glossary drift the first time either
 * definition is retouched.
 *
 * The English column is a list of language KEYWORDS, not copy: `Variable` and
 * `Loop` are the same tokens in every localisation of this page, so they stay
 * beside the structure rather than in the Arabic string table. Everything a
 * translator would touch is in `copy.essentials`.
 */
export interface EssentialTerm {
  en: string;
  ar: string;
  body: string;
}

export const ESSENTIAL_TERMS: readonly EssentialTerm[] = [
  { en: 'Variable', ar: e.t1Ar, body: e.t1Body },
  { en: 'Function', ar: e.t2Ar, body: e.t2Body },
  { en: 'Loop', ar: e.t3Ar, body: e.t3Body },
  { en: 'Array', ar: e.t4Ar, body: e.t4Body },
  { en: 'Condition', ar: e.t5Ar, body: e.t5Body },
  { en: 'Object', ar: e.t6Ar, body: e.t6Body },
  { en: 'Data Type', ar: e.t7Ar, body: e.t7Body },
  { en: 'Operator', ar: e.t8Ar, body: e.t8Body },
  { en: 'Error', ar: e.t9Ar, body: e.t9Body },
  { en: 'Comment', ar: e.t10Ar, body: e.t10Body },
  { en: 'Input / Output', ar: e.t11Ar, body: e.t11Body },
  { en: 'Algorithm', ar: e.t12Ar, body: e.t12Body },
] as const;
