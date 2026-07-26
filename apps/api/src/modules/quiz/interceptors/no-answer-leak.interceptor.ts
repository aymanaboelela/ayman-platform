import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { collectKeysDeep, FORBIDDEN_ANSWER_KEYS } from '../serializers/learner.serializer';
import { NO_ANSWER_LEAK_KEY } from './no-answer-leak.decorator';

/**
 * The runtime half of layer 2. It runs in EVERY environment, including
 * production: the cost is one walk over a payload that is a few kilobytes at
 * most, and the alternative — trusting that no future refactor ever re-adds a
 * field — is not a control.
 *
 * It throws rather than stripping. Silently removing the key would hide the
 * regression; a 500 with a log line naming the offending key gets it fixed.
 */
@Injectable()
export class NoAnswerLeakInterceptor implements NestInterceptor {
  private readonly logger = new Logger(NoAnswerLeakInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const guarded = this.reflector.getAllAndOverride<boolean>(NO_ANSWER_LEAK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!guarded) return next.handle();

    return next.handle().pipe(
      map((body: unknown) => {
        const offending = [...collectKeysDeep(body)].filter((key) =>
          FORBIDDEN_ANSWER_KEYS.has(key),
        );
        if (offending.length > 0) {
          this.logger.error(
            `answer leak blocked on ${context.getClass().name}.${context.getHandler().name}: ${offending.join(', ')}`,
          );
          // Fail closed. A learner receiving a 500 is a bug report; a learner
          // receiving the answer key is a broken product.
          throw new InternalServerErrorException();
        }
        return body;
      }),
    );
  }
}
