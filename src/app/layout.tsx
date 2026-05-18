import type { Metadata, Viewport } from 'next';
import { EB_Garamond, Inter, VT323 } from 'next/font/google';
import './globals.css';
import { RegisterSW } from '@/components/RegisterSW';
import { SpecialFilterDefs } from '@/components/SpecialFilterDefs';
import { es } from '@/lib/i18n/es';

const garamond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500'],
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// Pixel/terminal font used for the month name in the timestamp watermark —
// pairs visually with DSEG14 (numbers + AM/PM) by sharing the retro-digital
// vibe while remaining clearly distinct (pixels vs segments).
const vt323 = VT323({
  subsets: ['latin'],
  variable: '--font-pixel',
  weight: '400',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${es.brand} — ${es.tagline}`,
  description: es.tagline,
  manifest: '/manifest.json',
  applicationName: 'Rollo',
  appleWebApp: {
    capable: true,
    title: 'Rollo',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#E85D04',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${garamond.variable} ${inter.variable} ${vt323.variable}`}>
      <body className="min-h-dvh bg-rollo-bg font-sans text-rollo-ink">
        <RegisterSW />
        <SpecialFilterDefs />
        {children}
      </body>
    </html>
  );
}
