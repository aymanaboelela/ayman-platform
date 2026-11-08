import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors, UsePipes } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, seconds } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { ZodValidationPipe } from 'nestjs-zod';
import { MAX_UPLOAD_BYTES } from '@ayman/contracts/admin/media';
import type { PublicReservation, ReservationConfig } from '@ayman/contracts/center-reservations';
import { Public } from '../../auth/decorators/public.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { ReservationCreateDto, ReservationPaymentDto } from './center-reservations.dto';
import { CenterReservationsService } from './center-reservations.service';

interface MulterFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * Same shape as a guest book order's `CREATE_THROTTLE`, for the same reason:
 * the global guard keys on a session cookie a public route never requires, so
 * the per-address ceiling is the one that holds against a script.
 */
const WRITE_THROTTLE = {
  short: { limit: 2, ttl: seconds(10) },
  medium: { limit: 10, ttl: seconds(600) },
  long: { limit: 30, ttl: seconds(3600) },
  ip: { limit: 40, ttl: seconds(3600) },
};

/**
 * «حجز السناتر» — the public half. No account: the page is opened from a link
 * by students who mostly have none yet. A reservation's `id` is what the
 * student's browser holds to come back to it (see the service).
 *
 * `@RequireCsrf()` on every write — `@Public()` does not imply "no CSRF".
 */
@RequireFeature('centerReservations')
@Controller('center-reservations')
export class CenterReservationsController {
  constructor(private readonly reservations: CenterReservationsService) {}

  @Public()
  @Get('config')
  config(): Promise<ReservationConfig> {
    return this.reservations.config();
  }

  @Public()
  @RequireCsrf()
  @Throttle(WRITE_THROTTLE)
  @Post('screenshot')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  uploadScreenshot(@UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('no file uploaded');
    return this.reservations.uploadScreenshot(file);
  }

  @Public()
  @RequireCsrf()
  @Throttle(WRITE_THROTTLE)
  @UsePipes(ZodValidationPipe)
  @Post()
  create(@Body() body: ReservationCreateDto): Promise<PublicReservation> {
    return this.reservations.create(body as never);
  }

  @Public()
  @RequireCsrf()
  @Throttle(WRITE_THROTTLE)
  @UsePipes(ZodValidationPipe)
  @Post(':id/payment')
  submitPayment(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReservationPaymentDto): Promise<PublicReservation> {
    return this.reservations.submitPayment(id, body as never);
  }

  @Public()
  @RequireCsrf()
  @Throttle(WRITE_THROTTLE)
  @Post(':id/confirm')
  confirmFree(@Param('id', ParseUUIDPipe) id: string): Promise<PublicReservation> {
    return this.reservations.confirmFree(id);
  }

  @Public()
  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string): Promise<PublicReservation> {
    return this.reservations.getPublic(id);
  }
}
