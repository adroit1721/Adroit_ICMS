import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DEFAULT_CMS_CONFIG } from '@/lib/defaults';
import { getDb, isMongoConfigured } from '@/lib/server/mongodb';
import { ensureSettingsDoc } from '@/lib/server/erp-repository';
import { PWARegister } from '@/components/common/PWARegister';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  let title = DEFAULT_CMS_CONFIG.siteTitle || DEFAULT_CMS_CONFIG.schoolName;
  let description = `${DEFAULT_CMS_CONFIG.schoolName} — ${DEFAULT_CMS_CONFIG.motto}`;
  let faviconUrl = DEFAULT_CMS_CONFIG.faviconUrl || '/icon.svg';

  let appTitle = DEFAULT_CMS_CONFIG.schoolName;
  let appleIconUrl = '/apple-touch-icon.png';

  try {
    if (isMongoConfigured()) {
      const cms = await Promise.race([
        (async () => {
          const db = await getDb();
          const settings = await ensureSettingsDoc(db);
          return settings.cmsConfig;
        })(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
      ]);

      if (cms) {
        appTitle = cms.schoolName?.trim() || cms.siteTitle?.trim() || appTitle;
        title = cms.siteTitle?.trim() || cms.schoolName?.trim() || title;
        if (cms.schoolName?.trim() || cms.motto?.trim()) {
          description = `${cms.schoolName || title}${cms.motto ? ` — ${cms.motto}` : ''}`;
        }
        if (cms.faviconUrl?.trim()) {
          faviconUrl = cms.faviconUrl.trim();
        }
        const brandIconSource = cms.crestUrl?.trim() || cms.faviconUrl?.trim();
        if (brandIconSource) {
          if (brandIconSource.includes('res.cloudinary.com') && brandIconSource.includes('/upload/')) {
            appleIconUrl = brandIconSource.replace('/upload/', '/upload/w_180,h_180,c_pad,f_png/');
          } else if (brandIconSource.toLowerCase().endsWith('.png')) {
            appleIconUrl = brandIconSource;
          }
        }
      }
    }
  } catch {
    // Fallback cleanly to default metadata when DB is offline or during build
  }

  return {
    title,
    description,
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: appTitle.slice(0, 12) || 'School',
    },
    icons: {
      icon: faviconUrl || '/icon.svg',
      apple: appleIconUrl,
    },
    openGraph: {
      title,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,400..600,0..1,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-background font-body-md text-on-surface antialiased selection:bg-primary-fixed selection:text-on-primary-fixed" suppressHydrationWarning>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
