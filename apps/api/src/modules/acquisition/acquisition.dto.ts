import { createZodDto } from 'nestjs-zod';
import { AcquisitionClaimSchema } from '@ayman/contracts/acquisition';

export class AcquisitionClaimDto extends createZodDto(AcquisitionClaimSchema) {}
