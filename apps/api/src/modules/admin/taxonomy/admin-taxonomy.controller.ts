import { Body, Controller, Delete, Get, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { AdminTaxonomyService } from './admin-taxonomy.service';
import {
  AcademicYearPatchDto,
  GovernoratePatchDto,
  SubjectCreateDto,
  SubjectOfferingCreateDto,
  SubjectOfferingPatchDto,
  SubjectPatchDto,
  SystemPatchDto,
  TrackCreateDto,
  TrackPatchDto,
} from './admin-taxonomy.dto';

/**
 * Everything in spec §6.1 becomes admin-editable, including the Arabic
 * labels. Two identity fields stay immutable — `EducationSystem.slug` and
 * `Track.slug` — by the simple mechanism of never appearing in a patch DTO
 * (A13). There is no delete endpoint for `Governorate` at all: it is the FK
 * target of every student profile, so `PATCH .../governorates/:code` with
 * `{ isActive: false }` is the entire answer to "how do we remove one".
 */
@Controller('admin/taxonomy')
@RequirePermission('taxonomy:write')
@UsePipes(ZodValidationPipe)
export class AdminTaxonomyController {
  constructor(private readonly taxonomy: AdminTaxonomyService) {}

  @RequirePermission('taxonomy:read')
  @Get('governorates')
  listGovernorates() {
    return this.taxonomy.listGovernorates();
  }

  @Patch('governorates/:code')
  patchGovernorate(@Param('code') code: string, @Body() body: GovernoratePatchDto) {
    return this.taxonomy.patchGovernorate(code, body);
  }

  @RequirePermission('taxonomy:read')
  @Get('systems')
  listSystems() {
    return this.taxonomy.listSystems();
  }

  @Patch('systems/:id')
  patchSystem(@Param('id') id: string, @Body() body: SystemPatchDto) {
    return this.taxonomy.patchSystem(id, body);
  }

  @Patch('academic-years/:id')
  patchAcademicYear(@Param('id') id: string, @Body() body: AcademicYearPatchDto) {
    return this.taxonomy.patchAcademicYear(id, body);
  }

  @RequirePermission('taxonomy:read')
  @Get('tracks')
  listTracks() {
    return this.taxonomy.listTracks();
  }

  @Post('tracks')
  createTrack(@Body() body: TrackCreateDto) {
    return this.taxonomy.createTrack(body);
  }

  @Patch('tracks/:id')
  patchTrack(@Param('id') id: string, @Body() body: TrackPatchDto) {
    return this.taxonomy.patchTrack(id, body);
  }

  @RequirePermission('taxonomy:read')
  @Get('subjects')
  listSubjects() {
    return this.taxonomy.listSubjects();
  }

  @Post('subjects')
  createSubject(@Body() body: SubjectCreateDto) {
    return this.taxonomy.createSubject(body);
  }

  @Patch('subjects/:id')
  patchSubject(@Param('id') id: string, @Body() body: SubjectPatchDto) {
    return this.taxonomy.patchSubject(id, body);
  }

  @Delete('subjects/:id')
  async deleteSubject(@Param('id') id: string) {
    await this.taxonomy.deleteSubject(id);
    return { ok: true };
  }

  @RequirePermission('taxonomy:read')
  @Get('subject-offerings')
  listSubjectOfferings() {
    return this.taxonomy.listSubjectOfferings();
  }

  @Post('subject-offerings')
  createSubjectOffering(@Body() body: SubjectOfferingCreateDto) {
    return this.taxonomy.createSubjectOffering(body);
  }

  @Patch('subject-offerings/:id')
  patchSubjectOffering(@Param('id') id: string, @Body() body: SubjectOfferingPatchDto) {
    return this.taxonomy.patchSubjectOffering(id, body);
  }
}
