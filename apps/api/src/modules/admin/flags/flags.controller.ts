import { Body, Controller, Get, Param, Patch, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { Public } from '../../../auth/decorators/public.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { FeatureFlagPatchDto } from './flags.dto';
import { FlagsService } from './flags.service';

@Controller()
@UsePipes(ZodValidationPipe)
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  /** Public: values only — this is what `getFlags()`'s cached loader reads. */
  @Public()
  @Get('flags')
  listPublic() {
    return this.flags.listPublic();
  }

  @RequirePermission('flags:read')
  @Get('admin/flags')
  listAdmin() {
    return this.flags.listAdmin();
  }

  @RequirePermission('flags:write')
  @Patch('admin/flags/:key')
  setEnabled(@Param('key') key: string, @Body() body: FeatureFlagPatchDto) {
    return this.flags.setEnabled(key, body.enabled);
  }
}
