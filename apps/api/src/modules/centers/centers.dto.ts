import {
  AdminCenterPatchSchema,
  AdminCenterWriteSchema,
  AdminSetBookingSchema,
  AdminSlotPatchSchema,
  AdminSlotWriteSchema,
  AttendanceManualSchema,
  AttendanceScanSchema,
  AttendanceSheetQuerySchema,
  CenterFinanceQuerySchema,
} from '@ayman/contracts/admin/centers';
import { createZodDto } from 'nestjs-zod';

export class AdminCenterWriteDto extends createZodDto(AdminCenterWriteSchema) {}
export class AdminCenterPatchDto extends createZodDto(AdminCenterPatchSchema) {}
export class AdminSlotWriteDto extends createZodDto(AdminSlotWriteSchema) {}
export class AdminSlotPatchDto extends createZodDto(AdminSlotPatchSchema) {}
export class AdminSetBookingDto extends createZodDto(AdminSetBookingSchema) {}
export class AttendanceScanDto extends createZodDto(AttendanceScanSchema) {}
export class AttendanceManualDto extends createZodDto(AttendanceManualSchema) {}
export class AttendanceSheetQueryDto extends createZodDto(AttendanceSheetQuerySchema) {}
export class CenterFinanceQueryDto extends createZodDto(CenterFinanceQuerySchema) {}
