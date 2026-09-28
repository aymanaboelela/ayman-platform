import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { FormField } from './form-field';

/** عين كلمة السر في الدخول والتسجيل: بتبدأ مخفية، ودوسة بتظهرها، ودوسة تانية بتخفيها. */
describe('FormField password eye', () => {
  afterEach(cleanup);

  it('starts hidden and toggles between password and text', () => {
    render(<FormField label="كلمة السر" name="password" type="password" autoComplete="current-password" />);
    const input = screen.getByLabelText('كلمة السر');
    expect(input).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: copy.auth.fields.showPassword }));
    expect(input).toHaveAttribute('type', 'text');
    // مدير الباسوردات لسه شايفها خانة باسورد.
    expect(input).toHaveAttribute('autocomplete', 'current-password');

    fireEvent.click(screen.getByRole('button', { name: copy.auth.fields.hidePassword }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('adds no eye to other fields', () => {
    render(<FormField label="الاسم" name="name" type="text" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
