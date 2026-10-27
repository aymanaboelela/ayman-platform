import { brandImage } from '@/lib/brand-image';
import { getBranding } from '@/lib/settings';
import { ThemedImage } from '@/components/themed-image';
import { Brain, Check, Flame, Lightbulb, Sparkles, Trophy } from 'lucide-react';

/** Rising embers — positions and timings vary per child in `practice.css`. */
const EMBERS = 14;

/**
 * The picture beside «اختبارات مجانية»: the instructor riding the dragon, in
 * motion — a slow push-in on the photo, a glowing frame that turns, embers
 * rising off the fire and four icon bubbles drifting around the edge.
 *
 * ⚠️ No text on it, by request: an earlier version floated a sample question,
 * a score ring and a best score over the photo, and he asked for the words to
 * come off and the picture to move instead.
 *
 * Shared by the landing-page invite and the `/practice` hero so the two never
 * drift. Decorative as a whole (`aria-hidden`); the section's own heading
 * says what it is. Every animation is CSS and stops under
 * `prefers-reduced-motion`. Without the photo (a stack that is not Ayman's)
 * the frame holds a designed gradient instead.
 */
export async function PracticeShowcase({ priority = false }: { priority?: boolean }) {
  // An upload from «الهوية البصرية» first, his file second — `brandImage()`.
  const photo = brandImage(await getBranding(), 'practiceGuide');
  return (
    <div className="practice-show" aria-hidden="true">
      <span className="practice-show__glow" />
      <div className="practice-show__frame">
        <div className="practice-show__window">
          {photo ? (
            <ThemedImage
              className="practice-show__photo"
              image={photo}
              alt=""
              sizes="(max-width: 48rem) 92vw, 36rem"
              priority={priority}
            />
          ) : (
            <div className="practice-show__photo practice-show__photo--none">
              <Sparkles size={56} />
            </div>
          )}
          <span className="practice-show__shine" />
          <span className="practice-show__embers">
            {Array.from({ length: EMBERS }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        </div>
      </div>
      <span className="practice-bubble practice-bubble--check">
        <Check size={22} />
      </span>
      <span className="practice-bubble practice-bubble--trophy">
        <Trophy size={22} />
      </span>
      <span className="practice-bubble practice-bubble--idea">
        <Lightbulb size={20} />
      </span>
      <span className="practice-bubble practice-bubble--brain">
        <Brain size={20} />
      </span>
      <span className="practice-bubble practice-bubble--flame">
        <Flame size={18} />
      </span>
    </div>
  );
}
