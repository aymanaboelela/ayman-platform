import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or an entire controller) as reachable without a session.
 * Everything else is protected by default — see `AuthGuard`. Apply narrowly:
 * per Task 2, exactly `GET /api/health` and `GET /api/taxonomy` carry this.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
