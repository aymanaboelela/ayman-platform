import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UsePipes } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  AdminCenters,
  AdminSlotBookings,
  AttendanceScanResult,
  AttendanceSheet,
  CenterFinance,
  StudentAttendance,
} from '@ayman/contracts/admin/centers';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequireCsrf } from '../security/require-csrf.decorator';
import {
  AdminCenterPatchDto,
  AdminCenterWriteDto,
  AdminSetBookingDto,
  AdminSlotPatchDto,
  AdminSlotWriteDto,
  AttendanceManualDto,
  AttendanceScanDto,
  AttendanceSheetQueryDto,
  CenterFinanceQueryDto,
} from './centers.dto';
import { CentersService } from './centers.service';

/**
 * A door scanner reads a card every second or two while a class files in —
 * well above the global per-session limit meant for people clicking. This is
 * the scanner's own ceiling: a full room at the door, not a script.
 */
const SCAN_THROTTLE = {
  short: { limit: 20, ttl: seconds(10) },
  medium: { limit: 600, ttl: seconds(600) },
};

/**
 * «السناتر» — the admin screens' API. `center:read` to look, `center:write`
 * to set up centres/slots and move bookings, `center:attendance` for the door
 * (and nothing else — see the permission's own note).
 *
 * ⚠️ Literal segments (`attendance`, `finance`, `slots`, `students`) are
 * declared before any `:id` route so none of them is swallowed.
 */
@Controller('admin/centers')
@UsePipes(ZodValidationPipe)
export class AdminCentersController {
  constructor(private readonly centers: CentersService) {}

  @RequirePermission('center:read')
  @Get()
  list(): Promise<AdminCenters> {
    return this.centers.adminList();
  }

  @RequirePermission('center:read')
  @Get('finance')
  finance(@Query() query: CenterFinanceQueryDto): Promise<CenterFinance> {
    return this.centers.finance(query.month);
  }

  @RequirePermission('center:attendance')
  @RequireCsrf()
  @Throttle(SCAN_THROTTLE)
  @Post('attendance/scan')
  scan(@Body() body: AttendanceScanDto, @CurrentUser() user: AuthenticatedUser): Promise<AttendanceScanResult> {
    return this.centers.scan(user.id, body);
  }

  @RequirePermission('center:attendance')
  @RequireCsrf()
  @Post('attendance/manual')
  manual(@Body() body: AttendanceManualDto, @CurrentUser() user: AuthenticatedUser): Promise<AttendanceScanResult> {
    return this.centers.manual(user.id, body.slotId, body.userId, body.date);
  }

  @RequirePermission('center:attendance')
  @RequireCsrf()
  @Delete('attendance/:recordId')
  removeRecord(@Param('recordId') recordId: string, @CurrentUser() user: AuthenticatedUser): Promise<{ ok: true }> {
    return this.centers.removeRecord(user.id, recordId);
  }

  @RequirePermission('center:read')
  @Get('students/:userId/attendance')
  studentAttendance(@Param('userId') userId: string): Promise<StudentAttendance> {
    return this.centers.studentAttendance(userId);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Put('students/:userId/booking')
  setBooking(
    @Param('userId') userId: string,
    @Body() body: AdminSetBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    return this.centers.adminSetBooking(user.id, userId, body.slotId);
  }

  @RequirePermission('center:read')
  @Get('slots/:slotId/bookings')
  bookings(@Param('slotId') slotId: string): Promise<AdminSlotBookings> {
    return this.centers.slotBookings(slotId);
  }

  @RequirePermission('center:read')
  @Get('slots/:slotId/attendance')
  sheet(@Param('slotId') slotId: string, @Query() query: AttendanceSheetQueryDto): Promise<AttendanceSheet> {
    return this.centers.sheet(slotId, query.from, query.to);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Patch('slots/:slotId')
  patchSlot(
    @Param('slotId') slotId: string,
    @Body() body: AdminSlotPatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    return this.centers.patchSlot(user.id, slotId, body);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Delete('slots/:slotId')
  deleteSlot(@Param('slotId') slotId: string, @CurrentUser() user: AuthenticatedUser): Promise<{ ok: true }> {
    return this.centers.deleteSlot(user.id, slotId);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Post()
  create(@Body() body: AdminCenterWriteDto, @CurrentUser() user: AuthenticatedUser): Promise<{ id: string }> {
    return this.centers.createCenter(user.id, body);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Body() body: AdminCenterPatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    return this.centers.patchCenter(user.id, id, body);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ ok: true }> {
    return this.centers.deleteCenter(user.id, id);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Post(':id/slots')
  createSlot(
    @Param('id') id: string,
    @Body() body: AdminSlotWriteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string }> {
    return this.centers.createSlot(user.id, id, body);
  }
}
