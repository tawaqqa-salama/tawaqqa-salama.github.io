import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { LanguageProvider } from '@/lib/i18n/LanguageProvider';
import SwrProvider from '@/components/providers/SwrProvider';
import AppShell from '@/components/layout/AppShell';
import { PLATFORM_DESCRIPTION, PLATFORM_NAME } from '@/lib/constants/branding';
import { LOCALE_STORAGE_KEY } from '@/lib/i18n/types';
import './globals.css';

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-english',
  display: 'swap',
});

export const metadata: Metadata = {
  title: PLATFORM_NAME,
  description: PLATFORM_DESCRIPTION,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

const localeBootScript = `
(function(){
  try {
    var key = ${JSON.stringify(LOCALE_STORAGE_KEY)};
    var lang = localStorage.getItem(key);
    if (lang !== 'en' && lang !== 'ar') lang = 'ar';
    var root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'en' ? 'ltr' : 'rtl';
    root.dataset.lang = lang;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className={`${ibmPlexArabic.variable} ${inter.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeBootScript }} />
      </head>
      <body className="bg-[#f6f7fb] flex h-screen overflow-hidden overflow-x-hidden app-body-font">
        <LanguageProvider>
          <AuthProvider>
            <SwrProvider>
              <AppShell>{children}</AppShell>
            </SwrProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
