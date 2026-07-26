import { Body, Controller, Delete, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { SectionService } from './section.service';
import { CreateSectionDto, UpdateSectionDto } from './dto/section.dto';

@Controller('admin')
@UsePipes(ZodValidationPipe)
export class SectionController {
  constructor(private readonly sections: SectionService) {}

  @RequirePermission('section:write')
  @Post('courses/:courseId/sections')
  create(@Param('courseId') courseId: string, @Body() body: CreateSectionDto) {
    return this.sections.create(courseId, body);
  }

  @RequirePermission('section:write')
  @Patch('sections/:id')
  update(@Param('id') id: string, @Body() body: UpdateSectionDto) {
    return this.sections.update(id, body);
  }

  @RequirePermission('section:write')
  @Delete('sections/:id')
  remove(@Param('id') id: string) {
    return this.sections.remove(id);
  }
}
