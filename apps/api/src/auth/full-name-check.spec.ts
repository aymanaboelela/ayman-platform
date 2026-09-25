import { FULL_NAME_ERRORS } from '@ayman/contracts/full-name';
import { planFullNameCheck } from './full-name-check';

/**
 * The server half of «الاسم ثلاثي» — what stops a caller POSTing past the
 * register form. Pure, for the reason `./phone-identity.spec.ts` gives.
 */
describe('planFullNameCheck', () => {
  it.each(['/sign-in/email', '/sign-in/phone-number', '/get-session'])('ignores %s', (path) => {
    expect(planFullNameCheck(path, { name: 'aa' })).toEqual({ action: 'ignore' });
  });

  it('refuses a two-part name at sign-up', () => {
    expect(planFullNameCheck('/sign-up/email', { name: 'أحمد محمد' })).toEqual({
      action: 'reject',
      message: FULL_NAME_ERRORS.tooFewParts,
    });
  });

  it('refuses a sign-up with no name at all, in Arabic', () => {
    expect(planFullNameCheck('/sign-up/email', { phoneNumber: '01012345678' })).toEqual({
      action: 'reject',
      message: FULL_NAME_ERRORS.required,
    });
  });

  it('stores the tidied spelling of a valid name', () => {
    expect(planFullNameCheck('/sign-up/email', { name: ' أحمد  محمد   علي ' })).toEqual({
      action: 'rewrite',
      name: 'أحمد محمد علي',
    });
  });

  it('checks a name sent to /update-user', () => {
    expect(planFullNameCheck('/update-user', { name: 'Ahmed 2' })).toEqual({
      action: 'reject',
      message: FULL_NAME_ERRORS.characters,
    });
  });

  it('leaves an /update-user that does not touch the name alone', () => {
    expect(planFullNameCheck('/update-user', { image: 'x' })).toEqual({ action: 'ignore' });
  });
});
