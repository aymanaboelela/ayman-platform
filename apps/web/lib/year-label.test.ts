import { describe, expect, it } from 'vitest';
import { yearAliasesAr, yearLabelAr } from './year-label';

/**
 * ⚠️ This file exists for one character: `٢`.
 *
 * Before these aliases were published, nothing on this site — no page title,
 * no course, no structured data, no markdown twin — contained the string
 * «٢ بكالوريا» or «2 بكالوريا». The site spelled every year out in words, and
 * a student types the digit. Every query with a numeral in it was matching a
 * site that had none.
 *
 * The assertions below are on the CHARACTERS rather than on the list's shape,
 * because the failure mode is somebody "tidying" the list down to one digit
 * set or one spelling of «تانية». Both look redundant and neither is.
 */
describe('yearAliasesAr', () => {
  it('publishes both digit sets for every year', () => {
    // `٢` is U+0662 (Arabic-Indic) and `2` is U+0032. They are different bytes,
    // an Egyptian phone keyboard produces either depending on how it was set
    // up, and no search engine folds them together reliably on a phrase like
    // this. Shipping one is shipping half the queries.
    for (const [year, arabicIndic, ascii] of [
      [1, '١', '1'],
      [2, '٢', '2'],
      [3, '٣', '3'],
    ] as const) {
      const aliases = yearAliasesAr(year);
      expect(aliases, `year ${year} is missing ${arabicIndic}`).toContain(`${arabicIndic} بكالوريا`);
      expect(aliases, `year ${year} is missing ${ascii}`).toContain(`${ascii} بكالوريا`);
    }
  });

  it('keeps both the colloquial and the classical spelling of the second year', () => {
    // «تانية» is what is typed; «ثانية» is what a school writes. Neither is a
    // misspelling of the other and normalising one away loses real queries.
    const aliases = yearAliasesAr(2);
    expect(aliases).toContain('تانية بكالوريا');
    expect(aliases).toContain('ثانية بكالوريا');
  });

  it('leads with the canonical name so a consumer needing one can take the first', () => {
    for (const year of [1, 2, 3]) {
      expect(yearAliasesAr(year)[0]).toBe(yearLabelAr(year));
    }
  });

  it('never mixes one year’s spellings into another’s', () => {
    // A course that claimed all three years' aliases would be claiming to be
    // about all three years — the difference between an alias and keyword
    // stuffing, and the thing that gets the field discounted.
    expect(yearAliasesAr(1).join(' ')).not.toContain('٢');
    expect(yearAliasesAr(2).join(' ')).not.toContain('١');
    expect(yearAliasesAr(2).join(' ')).not.toContain('٣');
    expect(yearAliasesAr(3).join(' ')).not.toContain('٢');
  });
});
