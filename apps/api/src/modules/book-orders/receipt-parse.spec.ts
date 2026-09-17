import { parseReceiptText, readAmountCents, readReference } from './receipt-parse';

/**
 * The fixtures below are the real OCR output shapes from the two receipt apps
 * this meets, with every phone number and transfer reference REPLACED. The
 * layout, the garbage characters and the ordering are what the engine actually
 * produced on 2026-09-17; the numbers are invented, because a spec file is not
 * a place to keep a student's payment details.
 *
 * ⚠️ The garbage matters and is kept on purpose. These are `eng`-only passes
 * over Arabic receipts, so every label comes back as mojibake — «ai> 250.00
 * gaol» is «المبلغ 250.00 جنيه». The parser is built to work in exactly that,
 * and a spec written against clean text would pass while the real thing failed.
 */

/** إنستا باي — the receipt screen, light background, decimals everywhere. */
const INSTAPAY = `
10:14 4 oil = [ 6
< INSTA
2b Jrg=adll os
2lxis lull J] Jlgall Jaga od
ai> 250.00 gaol
01111111111 fe
Si lua] Jgd
dui> 1.00 dol Pg)
ai> 251.00 pyasall glall Jes]
099999999999 dulosl| 08)
12/09/2026 - 10:14 cadglly ay]
`;

/** فودافون كاش — an SMS thread, dark background, no decimals on the amount. */
const VODAFONE_SMS = `
10:01 all al =
& VF-Cash
me 48 0991599
mn 15 das] &)0
Yesterday 7:37 PM
geass Jb Gls diz 10 Cus
10:00 PM @
01111111111 p38) auix> 250 Jug=0 oJ
PD lw do) aux 1 deal w)las
41196.99 JI 4S (g8ldg9
: 10-9-2026 21:57 adosll &y)b
: 099999999999 dilo=ll 08)
`;

describe('readReference', () => {
  it('reads «رقم العملية» off an InstaPay receipt', () => {
    expect(readReference(INSTAPAY)).toBe('099999999999');
  });

  it('reads the same field off a Vodafone-Cash SMS', () => {
    expect(readReference(VODAFONE_SMS)).toBe('099999999999');
  });

  /**
   * The case the whole field exists for: `BK-EA9B7C` and `BK-7A3FD3` were one
   * transfer uploaded as two completely different pictures — an SMS and an app
   * receipt. No hash of either image can tell; the reference can.
   */
  it('gives ONE transfer the same reference from two different receipt apps', () => {
    expect(readReference(INSTAPAY)).toBe(readReference(VODAFONE_SMS));
  });

  /**
   * ⚠️ The recipient's number is eleven digits and the reference is twelve, so
   * "the longest run" would be right by accident here and wrong the day a bank
   * issues a ten-digit reference. The phone SHAPE is excluded instead.
   */
  it('never mistakes the recipient mobile for the reference', () => {
    expect(readReference('01111111111 fe')).toBeNull();
    for (const prefix of ['010', '011', '012', '015']) {
      expect(readReference(`${prefix}12345678`)).toBeNull();
    }
  });

  it('ignores runs that are too short, too long, or all one digit', () => {
    expect(readReference('12/09/2026 - 10:14')).toBeNull();
    expect(readReference('4111111111111111111')).toBeNull();
    expect(readReference('000000000000')).toBeNull();
  });

  it('is null rather than a guess when the receipt says nothing', () => {
    expect(readReference('')).toBeNull();
    expect(readReference('لا يوجد أرقام هنا')).toBeNull();
  });

  it('reads Arabic-Indic digits, which is what some keyboards paste', () => {
    expect(readReference('رقم العملية : ٠٢٣٠٣١٣٨٤١٨٩')).toBe('023031384189');
  });
});

describe('readAmountCents', () => {
  it('reads the transferred amount, not the total with fees', () => {
    // 250.00 is what was sent; 251.00 is what left the account.
    expect(readAmountCents(INSTAPAY)).toBe(25_000);
  });

  /**
   * ⚠️ This is the DESIGNED outcome, not a gap left open. A Vodafone SMS writes
   * «250 جنيه» with no decimals, and reading bare integers off this text
   * returned a battery percentage and a year on the real receipts. Null means
   * «مقريتش», and `submitPayment` never enforces the field — so a blank costs
   * nothing and a wrong number would send the admin after a payment that was
   * fine.
   */
  it('returns null on a receipt that writes the amount without decimals', () => {
    expect(readAmountCents(VODAFONE_SMS)).toBeNull();
  });

  it('skips the service fee under the floor and the balance over the ceiling', () => {
    expect(readAmountCents('dui> 1.00 dol Pg)')).toBeNull();
    expect(readAmountCents('41196.99 JI 4S')).toBeNull();
  });

  it('never reads an amount out of the middle of a long reference', () => {
    expect(readAmountCents('099999999999')).toBeNull();
    expect(readAmountCents('4111.11111111')).toBeNull();
  });

  it('accepts a comma as the decimal separator', () => {
    expect(readAmountCents('ai> 250,00 gaol')).toBe(25_000);
  });
});

describe('parseReceiptText', () => {
  it('returns both readings together', () => {
    expect(parseReceiptText(INSTAPAY)).toEqual({ ref: '099999999999', amountCents: 25_000 });
  });

  it('returns two nulls for an unreadable page rather than throwing', () => {
    expect(parseReceiptText('')).toEqual({ ref: null, amountCents: null });
  });
});
