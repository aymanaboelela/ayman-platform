import { phoneSearchDigits } from './phone-search';

describe('phoneSearchDigits', () => {
  it('finds the stored +20… number however the admin typed the start of it', () => {
    for (const typed of ['01015186', '+201015186', '201015186', '٠١٠١٥١٨٦', '010 151 86']) {
      expect(phoneSearchDigits(typed)).toBe('1015186');
    }
    expect('+201015186442'.includes(phoneSearchDigits('01015186')!)).toBe(true);
  });

  it('is not a phone search below three digits, or with none at all', () => {
    expect(phoneSearchDigits('01')).toBeNull();
    expect(phoneSearchDigits('أحمد')).toBeNull();
    expect(phoneSearchDigits('')).toBeNull();
  });
});
