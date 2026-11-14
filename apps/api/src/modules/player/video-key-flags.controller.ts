import { Controller, Get, Query } from '@nestjs/common';
import { ListQuerySchema, type ListResponse } from '@ayman/contracts/admin/list';
import type { VideoKeyFlagRow, VideoKeyFlagSummary } from '@ayman/contracts/admin/video-key-flags';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { parseRequest } from '../../common/http/parse-request';
import { VideoKeyFlagsService } from './video-key-flags.service';

/**
 * `/api/admin/video-key-flags` — «متابعة التنزيل».
 *
 * `student:read`, like `/admin/follow-up` and `/admin/subscribers`: every row
 * is a student's name and number, linking to a record that permission
 * already opens. `@RequireFeature('videoKeyWatch')` — «Ayman first».
 */
@Controller('admin/video-key-flags')
@RequireFeature('videoKeyWatch')
@RequirePermission('student:read')
export class AdminVideoKeyFlagsController {
  constructor(private readonly flags: VideoKeyFlagsService) {}

  @Get('summary')
  summary(): Promise<VideoKeyFlagSummary> {
    return this.flags.summary();
  }

  @Get()
  list(@Query() params: { page?: string; perPage?: string }): Promise<ListResponse<VideoKeyFlagRow>> {
    const list = parseRequest(ListQuerySchema, { page: params.page, perPage: params.perPage }, 'list query');
    return this.flags.list(list.perPage, (list.page - 1) * list.perPage);
  }
}
