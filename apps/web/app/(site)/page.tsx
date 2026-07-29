import { SiteHero } from '@/components/site/site-hero';
import { WhyMarquee } from '@/components/site/why-marquee';
import { FeaturedCourses } from '@/components/site/featured-courses';
import { YearTracks } from '@/components/site/year-tracks';
import { CodeLab } from '@/components/site/code-lab';
import { AboutInstructor } from '@/components/site/about-instructor';
import { SiteFaq } from '@/components/site/site-faq';

/**
 * The landing page is a composition and nothing else — every section owns its
 * own data, markup and motion. Reordering the page is reordering this list.
 */
export default function HomePage() {
  return (
    <main>
      <SiteHero />
      <WhyMarquee />
      <FeaturedCourses />
      <YearTracks />
      <CodeLab />
      <AboutInstructor />
      <SiteFaq />
    </main>
  );
}
