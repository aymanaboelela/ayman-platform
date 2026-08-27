import { Body, Controller, Get, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { TermService } from './term.service';
import { CreateTermDto, SetTermOpenDto, UpdateTermDto } from './dto/term.dto';

/**
 * الترم الأول / الترم الثاني. `section:write` throughout — managing a
 * course's terms is content authoring, the same authority as its sections,
 * and v1 introduces no separate role distinction for it (see
 * `TermService`'s own doc for what these routes do and do not enforce).
 */
@Controller('admin')
@UsePipes(ZodValidationPipe)
export class TermController {
  constructor(private readonly terms: TermService) {}

  @RequirePermission('section:write')
  @Get('courses/:courseId/terms')
  list(@Param('courseId') courseId: string) {
    return this.terms.list(courseId);
  }

  @RequirePermission('section:write')
  @Post('courses/:courseId/terms')
  create(@Param('courseId') courseId: string, @Body() body: CreateTermDto) {
    return this.terms.create(courseId, body);
  }

  @RequirePermission('section:write')
  @Patch('terms/:id')
  update(@Param('id') id: string, @Body() body: UpdateTermDto) {
    return this.terms.update(id, body);
  }

  /** The switch. A route of its own, not folded into the PATCH above — see
   *  `TermService.setOpen`'s own doc for why. */
  @RequirePermission('section:write')
  @Patch('terms/:id/open')
  setOpen(@Param('id') id: string, @Body() body: SetTermOpenDto) {
    return this.terms.setOpen(id, body.isOpen);
  }
}
