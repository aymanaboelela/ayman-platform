import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuthPasswordSchema, RegisterSchema } from '@ayman/contracts/auth';
import { copy } from '@ayman/contracts/copy';
import { guideCopy } from '@ayman/contracts/copy/guide';
import { FULL_NAME_ERRORS, FullNameSchema } from '@ayman/contracts/full-name';
import {
  LOCAL_MOBILE_DIGITS,
  PASSWORD_MIN_LENGTH,
  confirmStatus,
  nameStatus,
  passwordStatus,
  phoneStatus,
  statusOf,
} from './guide-status';

const s = guideCopy.status;

/**
 * The live line states no rule of its own: «تمام» has to mean the register
 * form's own schema will accept the field. Every case here that says «ok» is
 * therefore checked against the REAL schema, and every case that says «not
 * yet» against the real schema refusing it.
 */

describe('the name', () => {
  it('says nothing before anything is typed', () => {
    expect(nameStatus('')).toBeNull();
    expect(nameStatus('   ')).toBeNull();
  });

  it('counts the words still missing, by the form’s own «ثلاثي على الأقل»', () => {
    expect(nameStatus('مريم')).toEqual({ tone: 'todo', text: s.nameLeft.two });
    expect(nameStatus('مريم أحمد')).toEqual({ tone: 'todo', text: s.nameLeft.one });
    // Extra spaces are not extra words — the schema normalises them too.
    expect(nameStatus('  مريم   أحمد  ')).toEqual({ tone: 'todo', text: s.nameLeft.one });
  });

  it('says «تمام» exactly when the schema accepts the name', () => {
    for (const name of ['مريم أحمد علي', 'Mariam Ahmed Ali', 'مريم أحمد علي حسن']) {
      expect(nameStatus(name), name).toEqual({ tone: 'ok', text: s.nameOk });
      expect(FullNameSchema.safeParse(name).success, name).toBe(true);
    }
  });

  it('does not scold a word that is still being typed', () => {
    const midWord = nameStatus('مريم أحمد ع');
    expect(midWord).toEqual({ tone: 'todo', text: FULL_NAME_ERRORS.shortPart });
    expect(FullNameSchema.safeParse('مريم أحمد ع').success).toBe(false);
  });

  it('uses the schema’s own sentence for a name it will refuse', () => {
    expect(nameStatus('مريم أحمد 3')).toEqual({ tone: 'bad', text: FULL_NAME_ERRORS.characters });
    expect(nameStatus('مريم Ahmed علي')).toEqual({ tone: 'bad', text: FULL_NAME_ERRORS.mixed });
    for (const name of ['مريم أحمد 3', 'مريم Ahmed علي']) {
      expect(FullNameSchema.safeParse(name).success, name).toBe(false);
    }
  });
});

describe('the phone', () => {
  const valid = '01012345678';
  const accepts = (phone: string) =>
    RegisterSchema.safeParse({
      name: 'مريم أحمد علي',
      phone,
      password: 'x'.repeat(PASSWORD_MIN_LENGTH),
      confirmPassword: 'x'.repeat(PASSWORD_MIN_LENGTH),
    }).success;

  it('reads the shape of a mobile number off the form’s own placeholder', () => {
    expect(LOCAL_MOBILE_DIGITS).toBe(copy.auth.fields.phonePlaceholder.length);
    expect(accepts(copy.auth.fields.phonePlaceholder)).toBe(true);
    expect(phoneStatus(copy.auth.fields.phonePlaceholder)).toEqual({ tone: 'ok', text: s.phoneOk });
  });

  it('says nothing before anything is typed', () => {
    expect(phoneStatus('')).toBeNull();
  });

  it('counts the digits left while a number is being typed', () => {
    expect(phoneStatus('0')?.tone).toBe('todo');
    expect(phoneStatus('0101234567')).toEqual({ tone: 'todo', text: s.phoneLeft.one });
    expect(phoneStatus('010123456')).toEqual({ tone: 'todo', text: s.phoneLeft.two });
    expect(phoneStatus('01012')).toEqual({ tone: 'todo', text: s.phoneLeft.few.replace('{count}', '6') });
    // Arabic-Indic digits and spaces are the same number.
    expect(phoneStatus('٠١٠ ١٢٣٤')).toEqual({ tone: 'todo', text: s.phoneLeft.few.replace('{count}', '4') });
  });

  it('does NOT say «تمام» for a mobile number that is still two digits short', () => {
    // The form's validator already accepts nine and ten digits (see the note
    // on `phoneStatus`). The helper must not be the thing that tells a
    // student their sign-in number is finished when it is not.
    for (const short of ['010123456', '0101234567']) {
      expect(accepts(short), `${short} — the form takes it`).toBe(true);
      expect(phoneStatus(short)?.tone, short).toBe('todo');
    }
  });

  it('never says «تمام» about a number the form would refuse', () => {
    const tried = ['0', '01', '0101', '01012345', '01012345678', '010123456789', '+2010', '٠١٠١٢٣٤٥٦٧٨',
      '+201012345678', '010 1234 5678', '1012345678', '09912345678', '0212345678', 'abc', '00000000000'];
    for (const number of tried) {
      if (phoneStatus(number)?.tone === 'ok') expect(accepts(number), number).toBe(true);
    }
    // …and it does say it for every usual way of writing a whole one.
    for (const number of [valid, '٠١٠١٢٣٤٥٦٧٨', '+201012345678', '010 1234 5678', '1012345678']) {
      expect(phoneStatus(number), number).toEqual({ tone: 'ok', text: s.phoneOk });
    }
  });

  it('never calls a number wrong that the form would take', () => {
    for (const number of ['09912345678', '0212345678', '010123456', '+20101234567']) {
      expect(accepts(number), number).toBe(true);
      expect(phoneStatus(number)?.tone, number).not.toBe('bad');
    }
  });

  it('says so when the form itself would refuse a full-length number', () => {
    expect(accepts('010123456789')).toBe(false);
    expect(phoneStatus('010123456789')).toEqual({ tone: 'bad', text: s.phoneBad });
  });

  it('invents no count for a shape the form does not show', () => {
    // «+20…» half-typed, or a landline: no rule here says how long those are.
    expect(phoneStatus('+2010')).toBeNull();
    expect(phoneStatus('0212345678')).toBeNull();
  });
});

describe('the password', () => {
  it('finds the minimum by asking the schema, not by knowing it', () => {
    expect(AuthPasswordSchema.safeParse('x'.repeat(PASSWORD_MIN_LENGTH)).success).toBe(true);
    expect(AuthPasswordSchema.safeParse('x'.repeat(PASSWORD_MIN_LENGTH - 1)).success).toBe(false);
  });

  it('says nothing for an empty field', () => {
    expect(passwordStatus(0)).toBeNull();
  });

  it('counts the characters left to the minimum', () => {
    expect(passwordStatus(PASSWORD_MIN_LENGTH - 1)).toEqual({ tone: 'todo', text: s.passwordLeft.one });
    expect(passwordStatus(PASSWORD_MIN_LENGTH - 2)).toEqual({ tone: 'todo', text: s.passwordLeft.two });
    expect(passwordStatus(1)?.tone).toBe('todo');
  });

  it('agrees with the schema at every length', () => {
    for (let length = 1; length <= 140; length += 1) {
      const accepted = AuthPasswordSchema.safeParse('x'.repeat(length)).success;
      expect(passwordStatus(length)?.tone === 'ok', `length ${length}`).toBe(accepted);
    }
  });

  it('says a password past the maximum is too long', () => {
    expect(passwordStatus(500)).toEqual({ tone: 'bad', text: s.passwordLong });
  });
});

describe('the confirmation', () => {
  it('says whether the two match, and nothing while it is empty', () => {
    expect(confirmStatus(0, false)).toBeNull();
    expect(confirmStatus(4, false)).toEqual({ tone: 'todo', text: s.confirmBad });
    expect(confirmStatus(8, true)).toEqual({ tone: 'ok', text: s.confirmOk });
  });
});

describe('reading a field', () => {
  function form(values: Record<string, string>) {
    const element = document.createElement('form');
    for (const [name, value] of Object.entries(values)) {
      const input = document.createElement('input');
      input.name = name;
      input.value = value;
      element.append(input);
    }
    return (name: string) => element.elements.namedItem(name) as HTMLInputElement;
  }

  it('compares the confirmation with the password field beside it', () => {
    const same = form({ password: 'correct-horse', confirmPassword: 'correct-horse' });
    expect(statusOf('confirm', same('confirmPassword'))).toEqual({ tone: 'ok', text: s.confirmOk });
    const different = form({ password: 'correct-horse', confirmPassword: 'correct-hors' });
    expect(statusOf('confirm', different('confirmPassword'))).toEqual({ tone: 'todo', text: s.confirmBad });
  });

  it('never lets the password itself out — only a sentence comes back', () => {
    const field = form({ password: 'Tr0ub4dor&3-secret' })('password');
    const status = statusOf('password', field)!;
    expect(JSON.stringify(status)).not.toContain('Tr0ub4dor');
    expect(Object.keys(status).sort()).toEqual(['text', 'tone']);
  });

  it('holds no storage, network or logging call anywhere in the module', () => {
    // The values pass through these functions and nowhere else. A `fetch`,
    // a `console` or a storage write here would be the thing to catch.
    const source = readFileSync(join(import.meta.dirname, 'guide-status.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      '',
    );
    expect(source).not.toMatch(/fetch\(|console\.|Storage|localStorage|sessionStorage|sendBeacon|XMLHttpRequest/);
  });
});
