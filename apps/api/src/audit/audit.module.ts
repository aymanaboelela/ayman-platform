import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditContextInterceptor } from './audit-context.interceptor';
import { AuditService } from './audit.service';

/**
 * Global because every admin module writes to it and threading an import
 * through nine modules buys nothing. It exposes exactly one provider, plus
 * the interceptor that makes "who did this" ambient for the request.
 */
@Global()
@Module({
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
