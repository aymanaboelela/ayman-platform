import type { Metadata, Viewport } from 'next';
import { copy } from '@ayman/contracts';
import { plexArabic, plexMono } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${copy.site.name} — ${copy.site.tagline}`, template: `%s | ${copy.site.name}` },
  description: copy.site.tagline,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FCFCFD' },
    { media: '(prefers-color-scheme: dark)', color: '#08090A' },
  ],
};

/**
 * Applies the saved theme before first paint. Without this, a user who chose
 * "dark" sees a white flash on every navigation-free load.
 * Kept as a raw string so it ships inline and runs synchronously.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="dot-grid" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
