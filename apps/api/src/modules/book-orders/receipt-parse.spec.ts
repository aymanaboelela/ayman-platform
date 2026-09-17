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

/**
 * A third layout, and the one that forced both the currency rule and the sparse
 * OCR pass: a QNB/IPN receipt prints «250 EGP» in display type at the top and
 * the recipient's number far below it, so no line-distance rule reaches from
 * one to the other — and the default page-segmentation mode does not see the
 * big text at all.
 */
const QNB_IPN = `
dll diloell ani
250 EGP
Jganll logy glinll
mohammed171.mi@instapay
01111111111
099999999999 2)0ll
14 Sep 2026 10:59 PM gat]
`;

/** فودافون كاش، مصوَّرة من شاشة موبايل تاني وهي مقلوبة — بعد ما الـOCR عدّلها. */
const VODAFONE_PHOTO = `
01111111111 ﻢﻗﺭ ﻪﻴﻨﺟ 250 ﻞﻳﻮﺤﺗ ﻢﺗ
0 ﺔﻤﻴﻘﻟﺍ
`;

describe('readAmountCents — anchored on our own number', () => {
  const PAY_TO = ['+201111111111'];

  /**
   * ⚠️ The measurement that justifies the whole anchor. On the ten production
   * receipts the shape rule alone read the amount ONCE; anchored on the number
   * the money was sent to — ours, and therefore known before the page is read —
   * it reads all ten.
   */
  it('reads a bare integer when it sits beside our number', () => {
    expect(readAmountCents(VODAFONE_PHOTO, PAY_TO)).toBe(25_000);
    // ...and refuses the same text with no anchor to hang it on, because a bare
    // integer anywhere on a receipt is a battery percentage as often as money.
    expect(readAmountCents(VODAFONE_PHOTO)).toBeNull();
  });

  it('reads an amount the page labels in EGP, however far from our number', () => {
    expect(readAmountCents(QNB_IPN, PAY_TO)).toBe(25_000);
  });

  /**
   * ⚠️ The regression that made this rule worth writing down. «تاريخ العملية :
   * 10-9-2026» sits one line from the recipient in both Arabic layouts, and
   * `2026` is inside the plausible window — it was read as 2,026 EGP on four of
   * the ten real receipts. A wrong amount is worse than none: it would hold a
   * good order or pass a short one.
   */
  it('never reads a year off the date line as an amount', () => {
    const dated = ['01111111111 ﻞﻳﻮﺤﺗ', ': 10-9-2026 21:57 ﺔﻴﻠﻤﻌﻟﺍ ﺦﻳﺭﺎﺗ'].join('\n');
    expect(readAmountCents(dated, PAY_TO)).toBeNull();
  });

  /**
   * The Vodafone line survives OCR as «01225796476 p38) auix> 250», and `38` —
   * a fragment of the mangled Arabic — comes before the real number. Taking the
   * first reading on the line made it 38 EGP.
   */
  it('takes the largest reading on the anchor line, not the first', () => {
    expect(readAmountCents('01111111111 p38) auix> 250 Jug=0 oJ', PAY_TO)).toBe(25_000);
  });

  it('still refuses the service fee and the running balance', () => {
    expect(readAmountCents('01111111111 v\n1.00 dol Pg)\n41196.99 JI 4S', PAY_TO)).toBeNull();
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
