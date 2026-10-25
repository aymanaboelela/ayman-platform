import type { HomeBlockList } from '@ayman/contracts/admin/home-blocks';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { KitLanding } from '../kit/kit-landing';

/** The `kurrasa` landing page — the shared kit in this preset's look (`styles/presets-kit.css`). */
export default function KurrasaLanding({ blocks, honorBoard }: { blocks: HomeBlockList; honorBoard: HonorBoardEntry[] }) {
  return <KitLanding preset="kurrasa" blocks={blocks} honorBoard={honorBoard} />;
}
