import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import AppShell from '@/components/layout/AppShell';
import { PLATFORM_DESCRIPTION, PLATFORM_NAME } from '@/lib/constants/branding';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.className} bg-[#f0f2f5] flex h-screen overflow-hidden overflow-x-hidden`}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
