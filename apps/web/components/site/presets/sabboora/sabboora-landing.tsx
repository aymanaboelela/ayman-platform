import type { HomeBlockList } from '@ayman/contracts/admin/home-blocks';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { KitLanding } from '../kit/kit-landing';

/** The `sabboora` landing page — the shared kit in this preset's look (`presets.css`, KIT section). */
export default function SabbooraLanding({ blocks, honorBoard }: { blocks: HomeBlockList; honorBoard: HonorBoardEntry[] }) {
  return <KitLanding preset="sabboora" blocks={blocks} honorBoard={honorBoard} />;
}
