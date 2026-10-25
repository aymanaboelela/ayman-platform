import {
  DesignAssetPatchSchema,
  DesignFolderCreateSchema,
  DesignFolderPatchSchema,
  DesignPublishSchema,
} from '@ayman/contracts/designs';
import { createZodDto } from 'nestjs-zod';

export class DesignFolderCreateDto extends createZodDto(DesignFolderCreateSchema) {}
export class DesignFolderPatchDto extends createZodDto(DesignFolderPatchSchema) {}
export class DesignAssetPatchDto extends createZodDto(DesignAssetPatchSchema) {}
export class DesignPublishDto extends createZodDto(DesignPublishSchema) {}
