'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * The ONLY module that registers a GSAP plugin.
 *
 * `registerPlugin` is idempotent per plugin, but the module graph is not: every
 * file that imports `gsap/ScrollTrigger` directly pulls a second copy into a
 * second chunk under Turbopack, and the two copies keep separate trigger
 * registries. Symptom is subtle — half the triggers stop refreshing on resize —
 * so the constraint is enforced by convention here and by lint below.
 *
 * Import `gsap` and `ScrollTrigger` from this module, never from the package.
 */
gsap.registerPlugin(ScrollTrigger);

/**
 * ScrollTrigger's default is to fire `refresh()` on every resize, which on iOS
 * Safari includes the address-bar collapse — a resize that changes nothing about
 * layout but re-measures every trigger mid-scroll. Ignoring pure-height changes
 * on touch devices is the documented fix.
 */
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger };
