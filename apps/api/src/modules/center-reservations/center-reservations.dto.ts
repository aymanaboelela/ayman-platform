import {
  AdminReservationsQuerySchema,
  CenterManagerCreateSchema,
  CenterManagerPasswordSchema,
  ReservationCenterPatchSchema,
  ReservationCreateSchema,
  ReservationPaymentSchema,
  ReservationReviewSchema,
  ReservationSettingsSchema,
} from '@ayman/contracts/center-reservations';
import { createZodDto } from 'nestjs-zod';

export class ReservationCreateDto extends createZodDto(ReservationCreateSchema) {}
export class ReservationPaymentDto extends createZodDto(ReservationPaymentSchema) {}
export class AdminReservationsQueryDto extends createZodDto(AdminReservationsQuerySchema) {}
export class ReservationReviewDto extends createZodDto(ReservationReviewSchema) {}
export class ReservationSettingsDto extends createZodDto(ReservationSettingsSchema) {}
export class ReservationCenterPatchDto extends createZodDto(ReservationCenterPatchSchema) {}
export class CenterManagerCreateDto extends createZodDto(CenterManagerCreateSchema) {}
export class CenterManagerPasswordDto extends createZodDto(CenterManagerPasswordSchema) {}
