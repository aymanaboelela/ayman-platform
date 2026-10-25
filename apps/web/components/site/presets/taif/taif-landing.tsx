import type { HomeBlockList } from '@ayman/contracts/admin/home-blocks';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { KitLanding } from '../kit/kit-landing';

/** The `taif` landing page — the shared kit in this preset's look (`styles/presets-kit.css`). */
export default function TaifLanding({ blocks, honorBoard }: { blocks: HomeBlockList; honorBoard: HonorBoardEntry[] }) {
  return <KitLanding preset="taif" blocks={blocks} honorBoard={honorBoard} />;
}
