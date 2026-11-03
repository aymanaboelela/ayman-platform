import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PASSWORD_RESET_INVALID_CODE, PASSWORD_RESET_LIMITED } from '@ayman/contracts/password-reset';
import { FEATURE_KEY } from '../../auth/decorators/require-feature.decorator';
import { FeatureGuard } from '../../auth/guards/feature.guard';
import { PasswordResetController } from './password-reset.controller';

/**
 * The HTTP edge of «نسيت كلمة السر»: the entitlement gate, and how each
 * outcome of the service becomes a status code. The service's behaviour is
 * `password-reset.int-spec.ts`, against the real database.
 */

function guardContext(method: keyof PasswordResetController): ExecutionContext {
  return {
    getHandler: () => PasswordResetController.prototype[method],
    getClass: () => PasswordResetController,
  } as unknown as ExecutionContext;
}

describe('PasswordResetController — the gate', () => {
  it('is behind `passwordReset`, on the whole controller', () => {
    expect(Reflect.getMetadata(FEATURE_KEY, PasswordResetController)).toBe('passwordReset');
  });

  /*
   * The real entitlement state, not a mock: a stack with `TENANT_KEY` set and
   * no signed document runs on the declared defaults, and `passwordReset` is
   * off there. Re-imported in isolation because `TENANT_KEY` is read at import.
   */
  it('404s both routes on another teacher’s stack where nothing opened it', () => {
    const before = process.env.TENANT_KEY;
    process.env.TENANT_KEY = 'some-teacher';
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { FeatureGuard: IsolatedGuard } = require('../../auth/guards/feature.guard') as {
          FeatureGuard: typeof FeatureGuard;
        };
        const guard = new IsolatedGuard(new Reflector());
        // By message, not class: the isolated registry has its own copy of
        // `@nestjs/common`, so `NotFoundException` there is a different class.
        expect(() => guard.canActivate(guardContext('request'))).toThrow('Not Found');
        expect(() => guard.canActivate(guardContext('confirm'))).toThrow('Not Found');
      });
    } finally {
      if (before === undefined) delete process.env.TENANT_KEY;
      else process.env.TENANT_KEY = before;
    }
  });

  it('lets both routes through on Ayman’s stack', () => {
    const guard = new FeatureGuard(new Reflector());
    expect(guard.canActivate(guardContext('request'))).toBe(true);
    expect(guard.canActivate(guardContext('confirm'))).toBe(true);
  });
});

const HANDLE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('PasswordResetController — outcomes', () => {
  function make(outcome: unknown) {
    const resets = {
      request: jest.fn(async () => ({ outcome, delivery: null })),
      confirm: jest.fn(async () => outcome),
    };
    const controller = new PasswordResetController(resets as never);
    const response = { setHeader: jest.fn() };
    const request = { headers: { 'cf-connecting-ip': '203.0.113.9', 'x-captcha-response': 'tok' }, ip: '127.0.0.1' };
    return { controller, resets, response, request };
  }

  it('passes the client bucket, the raw address and the Turnstile token to the service', async () => {
    const { controller, resets, response, request } = make({ status: 'accepted', handle: HANDLE });
    await expect(
      controller.request({ phoneNumber: '+201012345678' }, request as never, response as never),
    ).resolves.toEqual({ status: 'accepted', handle: HANDLE });
    expect(resets.request).toHaveBeenCalledWith({
      phone: '+201012345678',
      ipBucket: '203.0.113.9',
      remoteIp: '203.0.113.9',
      captchaToken: 'tok',
    });
  });

  it('says `unavailable` as a 200 — it is a fact about the stack, not an error', async () => {
    const { controller, response, request } = make({ status: 'unavailable' });
    await expect(
      controller.request({ phoneNumber: '+201012345678' }, request as never, response as never),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('turns a limit into a 429 with Retry-After', async () => {
    const { controller, response, request } = make({ status: 'limited', retryAfterSeconds: 42 });
    const error = await controller
      .request({ phoneNumber: '+201012345678' }, request as never, response as never)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({ code: PASSWORD_RESET_LIMITED, retryAfterSeconds: 42 });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '42');
  });

  it('turns a failed human check into a 403', async () => {
    const { controller, response, request } = make({ status: 'human_check' });
    await expect(
      controller.request({ phoneNumber: '+201012345678' }, request as never, response as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers every failed confirm with the one code', async () => {
    const { controller } = make({ status: 'invalid' });
    const error = await controller
      .confirm({ phoneNumber: '+201012345678', handle: HANDLE, code: '123456', newPassword: 'whatever-1' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: PASSWORD_RESET_INVALID_CODE });
  });

  it('passes `reset` and `google` through', async () => {
    for (const status of ['reset', 'google'] as const) {
      const { controller, resets } = make({ status });
      await expect(
        controller.confirm({ phoneNumber: '+201012345678', handle: HANDLE, code: '123456', newPassword: 'whatever-1' }),
      ).resolves.toEqual({ status });
      expect(resets.confirm).toHaveBeenCalledWith(expect.objectContaining({ handle: HANDLE }));
    }
  });
});
