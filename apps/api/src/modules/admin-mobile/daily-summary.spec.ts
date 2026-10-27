import { dailySummaryPayload, whatsappChange } from './daily-summary';

describe('dailySummaryPayload', () => {
  it('says what sold, what it came to, and what is waiting', () => {
    const push = dailySummaryPayload({
      subscriptionCount: 5,
      newCount: 3,
      renewalCount: 2,
      netCents: 125_049,
      pending: 4,
    });

    expect(push.title).toBe('ملخص النهارده');
    expect(push.body).toBe('5 اشتراك (3 جديد، 2 تجديد) · الصافي 1250 جنيه · 4 طلب مستني مراجعة');
    expect(push.url).toBe('/admin/finance');
  });

  it('still sends on a quiet day, saying so instead of printing zeros', () => {
    const push = dailySummaryPayload({
      subscriptionCount: 0,
      newCount: 0,
      renewalCount: 0,
      netCents: 0,
      pending: 0,
    });

    expect(push.body).toBe('مفيش اشتراكات النهارده · الصافي 0 جنيه · مفيش طلبات مستنية');
  });
});

describe('whatsappChange', () => {
  it('says nothing on the first read after a boot, whatever the state', () => {
    expect(whatsappChange(null, 'disconnected')).toBeNull();
    expect(whatsappChange(null, 'connected')).toBeNull();
  });

  it('reports the edge into and out of connected, once', () => {
    expect(whatsappChange('connected', 'disconnected')).toBe('down');
    expect(whatsappChange('connected', 'unreachable')).toBe('down');
    expect(whatsappChange('disconnected', 'connected')).toBe('back');
    expect(whatsappChange('disconnected', 'disconnected')).toBeNull();
    expect(whatsappChange('disconnected', 'unreachable')).toBeNull();
  });

  it('treats a stack with no sender configured as neither up nor down', () => {
    expect(whatsappChange('connected', 'disabled')).toBeNull();
    expect(whatsappChange('disabled', 'connected')).toBeNull();
  });
});
