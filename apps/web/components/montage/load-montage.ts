import { MontageListSchema, type MontageList } from '@ayman/contracts/montage';
import { adminGet } from '@/lib/admin-api';

/**
 * The hand-over list, read on the server with the visitor's cookie — so the
 * API's `montage:read` is what decides, for the editor and the instructor
 * alike.
 */
export function loadMontage(): Promise<MontageList> {
  return adminGet('/api/montage', MontageListSchema);
}
