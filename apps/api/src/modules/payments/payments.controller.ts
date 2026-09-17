import { BadRequestException, Body, Controller, Get, Post, UploadedFile, UseInterceptors, UsePipes } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from 'nestjs-zod';
import { memoryStorage } from 'multer';
import { MAX_UPLOAD_BYTES } from '@ayman/contracts/admin/media';
import type { PaymentSubmission } from '@ayman/contracts/payments';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { SubmitPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

interface MulterFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * The student half. `payment:submit` is self-scoped — see the permission's
 * own note in `permissions.ts` — so every method here reads `user.id` from
 * the session and never a route parameter.
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Step one of the two-step upload — see `payments.ts` for why it is split. */
  @RequirePermission('payment:submit')
  @Post('screenshot')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async uploadScreenshot(@UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('no file uploaded');
    return this.payments.uploadScreenshot(file);
  }

  @RequirePermission('payment:submit')
  @UsePipes(ZodValidationPipe)
  @Post('submissions')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubmitPaymentDto,
  ): Promise<PaymentSubmission> {
    return this.payments.submit(user.id, body);
  }

  @RequirePermission('payment:submit')
  @Get('submissions/me')
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<PaymentSubmission[]> {
    return this.payments.listMine(user.id);
  }
}
