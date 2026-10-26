import '../../study.css';
import { shareBrand } from '@/lib/share-card/brand';
import { SharePreview } from './preview';

/**
 * `/dev/share-card` — both share images drawn inline, plus the two real
 * buttons, with fixed sample data. For designing the canvas without sitting
 * an exam or finishing a course. 404 in production (`isDevOnlyRoute`).
 */
export default function ShareCardDevPage() {
  return <SharePreview brand={shareBrand()} />;
}
