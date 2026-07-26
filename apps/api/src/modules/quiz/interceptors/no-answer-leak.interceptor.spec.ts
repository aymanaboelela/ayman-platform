import { InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { NoAnswerLeakInterceptor } from './no-answer-leak.interceptor';

function contextFor(guarded: boolean) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(guarded);
  return {
    interceptor: new NoAnswerLeakInterceptor(reflector),
    context: {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as never,
  };
}

describe('NoAnswerLeakInterceptor', () => {
  it('passes a clean payload through untouched', async () => {
    const { interceptor, context } = contextFor(true);
    const payload = { questions: [{ questionId: 'q', options: [{ id: 'o', bodyHtml: '<p>x</p>' }] }] };
    await expect(
      firstValueFrom(interceptor.intercept(context, { handle: () => of(payload) })),
    ).resolves.toBe(payload);
  });

  it('throws when a forbidden key hides three levels down', async () => {
    const { interceptor, context } = contextFor(true);
    const payload = { questions: [{ options: [{ id: 'o', fraction: 1 }] }] };
    await expect(
      firstValueFrom(interceptor.intercept(context, { handle: () => of(payload) })),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('throws on a leaked grading state', async () => {
    const { interceptor, context } = contextFor(true);
    await expect(
      firstValueFrom(
        interceptor.intercept(context, { handle: () => of({ q: { state: 'graded_right' } }) }),
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('leaves an unmarked route alone, so the review payload can carry answers', async () => {
    const { interceptor, context } = contextFor(false);
    const payload = { questions: [{ fraction: 1, rightAnswerText: '4' }] };
    await expect(
      firstValueFrom(interceptor.intercept(context, { handle: () => of(payload) })),
    ).resolves.toBe(payload);
  });
});
