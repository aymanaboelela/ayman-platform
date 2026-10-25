import {
  DesignFolderDetailSchema,
  DesignStudioSchema,
  type DesignFolderDetail,
  type DesignStudio,
} from '@ayman/contracts/designs';
import { adminGet, adminGetOrNull } from '@/lib/admin-api';

/**
 * The studio's first screen, read on the server with the visitor's cookie —
 * so the API's `design:read` check is what decides, for the designer and the
 * instructor alike. The folder in `?f=` opens if it still exists; otherwise
 * the first one does, so a stale bookmark lands somewhere useful.
 */
export async function loadStudio(
  folderParam: string | undefined,
): Promise<{ studio: DesignStudio; folder: DesignFolderDetail | null }> {
  const studio = await adminGet('/api/designs', DesignStudioSchema);
  const wanted = studio.folders.find((folder) => folder.id === folderParam) ?? studio.folders[0] ?? null;
  const folder = wanted
    ? await adminGetOrNull(`/api/designs/folders/${encodeURIComponent(wanted.id)}`, DesignFolderDetailSchema)
    : null;
  return { studio, folder };
}
