import { parseTransferText } from './transfer-parse';

/** The notification list exactly as Live Text reads it off the lock screen:
 *  the sender address wraps onto its own line, and the bottom card is caught
 *  twice — once whole, once as the sliver under the card above it. */
const NOTIFICATION_SCREENSHOT = `Notification Center
InstaPay
انستاباي            31m ago
لقد استلمت 250.13 جنيه من
moazkoritam@instapay
انستاباي            1h ago
لقد استلمت 250.47 جنيه من
rokaia1712@instapay
انستاباي            2h ago
لقد استلمت 450.00 جنيه من
rokaia1712@instapay
انستاباي            2h ago
لقد استلمت 250.00 جنيه من
ahmeddd.1-2619@instapay
لقد استلمت 300.00 جنيه من
eg6300010002200000@instapay
eg6300010002200000@instapay`;

const BANK_SMS = `تم اضافة مبلغ 300EGP    الى حساب    رقم xxx1734    فى 07-SEP-2026
عن طريق التحويل اللحظي`;

describe('parseTransferText — the InstaPay notification', () => {
  it('reads the amount and the sender off one notification', () => {
    const [transfer] = parseTransferText('لقد استلمت 250.13 جنيه من moazkoritam@instapay');
    expect(transfer).toMatchObject({
      source: 'notification',
      amountCents: 25013,
      senderHandle: 'moazkoritam@instapay',
    });
  });

  it('reads a sender address that wraps onto the next line', () => {
    const [transfer] = parseTransferText('لقد استلمت 250.13 جنيه من\nmoazkoritam@instapay');
    expect(transfer?.senderHandle).toBe('moazkoritam@instapay');
  });

  it('keeps the piastres, which are the whole point', () => {
    expect(parseTransferText('لقد استلمت 250.07 جنيه من a@instapay')[0]?.amountCents).toBe(25007);
    expect(parseTransferText('لقد استلمت 250.70 جنيه من a@instapay')[0]?.amountCents).toBe(25070);
  });

  it('reads a round amount as an exact hundred, not as seven piastres', () => {
    expect(parseTransferText('لقد استلمت 250.00 جنيه من a@instapay')[0]?.amountCents).toBe(25000);
    expect(parseTransferText('لقد استلمت 250 جنيه من a@instapay')[0]?.amountCents).toBe(25000);
  });

  it('reads Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(parseTransferText('لقد استلمت ٢٥٠٫١٣ جنيه من a@instapay')[0]?.amountCents).toBe(25013);
  });

  it('reads a thousands separator', () => {
    expect(parseTransferText('لقد استلمت 1,250.13 جنيه من a@instapay')[0]?.amountCents).toBe(125013);
  });

  it('reads an address that is an IBAN rather than a name', () => {
    const [transfer] = parseTransferText('لقد استلمت 300.00 جنيه من eg6300010002200000@instapay');
    expect(transfer?.senderHandle).toBe('eg6300010002200000@instapay');
  });

  it('reads an address containing dots and dashes', () => {
    const [transfer] = parseTransferText('لقد استلمت 250.00 جنيه من ahmeddd.1-2619@instapay');
    expect(transfer?.senderHandle).toBe('ahmeddd.1-2619@instapay');
  });

  it('reads every notification in one screenshot', () => {
    const transfers = parseTransferText(NOTIFICATION_SCREENSHOT);
    expect(transfers.map((transfer) => transfer.amountCents)).toEqual([
      25013, 25047, 45000, 25000, 30000,
    ]);
  });

  it('collapses the bottom card caught twice in one screenshot', () => {
    const transfers = parseTransferText(NOTIFICATION_SCREENSHOT);
    expect(transfers.filter((transfer) => transfer.amountCents === 30000)).toHaveLength(1);
  });

  it('keeps two genuinely different transfers from the same sender', () => {
    const transfers = parseTransferText(
      'لقد استلمت 250.00 جنيه من rokaia1712@instapay\nلقد استلمت 450.00 جنيه من rokaia1712@instapay',
    );
    expect(transfers).toHaveLength(2);
  });

  it('carries the line it read as evidence', () => {
    const [transfer] = parseTransferText('junk\nلقد استلمت 250.13 جنيه من moazkoritam@instapay\njunk');
    expect(transfer?.rawLine).toBe('استلمت 250.13 جنيه من moazkoritam@instapay');
  });
});

describe('parseTransferText — the bank SMS', () => {
  it('reads the amount out of Banque Misr’s wording', () => {
    const [transfer] = parseTransferText(BANK_SMS);
    expect(transfer).toMatchObject({ source: 'sms', amountCents: 30000, senderHandle: null });
  });

  it('reads piastres if the bank ever sends them', () => {
    expect(
      parseTransferText('تم اضافة مبلغ 250.13EGP الى حساب رقم xxx1734')[0]?.amountCents,
    ).toBe(25013);
  });

  it('reads the hamza spelt either way', () => {
    expect(parseTransferText('تم إضافة مبلغ 300EGP الى حساب')[0]?.amountCents).toBe(30000);
  });

  it('never invents a sender for an SMS, which names none', () => {
    expect(parseTransferText(BANK_SMS)[0]?.senderHandle).toBeNull();
  });
});

describe('parseTransferText — what it refuses to read', () => {
  it('returns nothing for text that is not about a transfer', () => {
    expect(parseTransferText('مساء الخير يا استاذ ايمن، انا حولت الفلوس')).toEqual([]);
  });

  it('ignores an outgoing transfer', () => {
    expect(parseTransferText('لقد أرسلت 250.00 جنيه الى ayman@instapay')).toEqual([]);
  });

  it('keeps a recognisable but unreadable line, with no amount', () => {
    const [transfer] = parseTransferText('لقد استلمت ٢٥٠،٠۰ ججنيه م moazkoritam');
    expect(transfer).toMatchObject({ source: 'notification', amountCents: null, senderHandle: null });
    expect(transfer?.rawLine).toContain('استلمت');
  });

  it('does not also report a line it read perfectly well as unreadable', () => {
    expect(parseTransferText('لقد استلمت 250.13 جنيه من moazkoritam@instapay')).toHaveLength(1);
  });

  // Truncating to 250.13 would be a guess, and a guess here spends a code
  // that belongs to a real student. Better to hand the admin a line to look at.
  it('refuses an amount with more precision than money has, rather than truncating it', () => {
    expect(parseTransferText('لقد استلمت 250.135 جنيه من a@instapay')[0]?.amountCents).toBeNull();
  });

  it('refuses a zero transfer', () => {
    expect(parseTransferText('لقد استلمت 0.00 جنيه من a@instapay')[0]?.amountCents).toBeNull();
  });
});
