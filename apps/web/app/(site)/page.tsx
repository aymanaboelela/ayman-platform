import { SiteHero } from '@/components/site/site-hero';
import { WhyRail } from '@/components/site/why-rail';
import { FeaturedCourses } from '@/components/site/featured-courses';
import { InstructorProfile } from '@/components/site/instructor-profile';
import { YearTracks } from '@/components/site/year-tracks';
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
      <WhyRail />
      <FeaturedCourses />
      <InstructorProfile />
      <YearTracks />
      <AboutInstructor />
      <SiteFaq />
    </main>
  );
}
