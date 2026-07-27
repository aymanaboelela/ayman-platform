import { FeatureFlagPatchSchema } from '@ayman/contracts/admin/flags';
import { createZodDto } from 'nestjs-zod';

export class FeatureFlagPatchDto extends createZodDto(FeatureFlagPatchSchema) {}
