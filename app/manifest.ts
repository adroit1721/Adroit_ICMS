import type { MetadataRoute } from 'next';
import { getDb, isMongoConfigured } from '@/lib/server/mongodb';
import { ensureSettingsDoc } from '@/lib/server/erp-repository';
import { DEFAULT_CMS_CONFIG } from '@/lib/defaults';
import type { CMSConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

function toSizedPngIconUrl(rawUrl: string | undefined, size: 192 | 512): string | null {
  const url = (rawUrl || '').trim();
  if (!url) return null;
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/w_${size},h_${size},c_pad,f_png/`);
  }
  if (url.toLowerCase().endsWith('.png')) {
    return url;
  }
  return null;
}

function toMaskablePngIconUrl(rawUrl: string | undefined): string | null {
  const url = (rawUrl || '').trim();
  if (!url) return null;
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/w_384,h_384,c_fit/w_512,h_512,c_lpad,b_white,f_png/');
  }
  return null;
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let appName = DEFAULT_CMS_CONFIG.schoolName || DEFAULT_CMS_CONFIG.siteTitle;
  let shortName = (DEFAULT_CMS_CONFIG.schoolName || 'School').slice(0, 12);
  let description = `${DEFAULT_CMS_CONFIG.schoolName} — ${DEFAULT_CMS_CONFIG.motto}`;
  let cmsData: CMSConfig | null = null;

  try {
    if (isMongoConfigured()) {
      cmsData = await Promise.race([
        (async () => {
          const db = await getDb();
          const settings = await ensureSettingsDoc(db);
          return settings.cmsConfig;
        })(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
      ]);

      if (cmsData) {
        if (cmsData.schoolName?.trim()) {
          appName = cmsData.schoolName.trim();
          shortName = cmsData.schoolName.trim().slice(0, 12);
        } else if (cmsData.siteTitle?.trim()) {
          appName = cmsData.siteTitle.trim();
          shortName = cmsData.siteTitle.trim().slice(0, 12);
        }
        if (cmsData.motto?.trim()) {
          description = `${appName} — ${cmsData.motto}`;
        }
      }
    }
  } catch {
    // Clean fallback to default branding
  }

  const brandIcon192 =
    toSizedPngIconUrl(cmsData?.crestUrl, 192) ||
    toSizedPngIconUrl(cmsData?.faviconUrl, 192) ||
    '/pwa-192x192.png';
  const brandIcon512 =
    toSizedPngIconUrl(cmsData?.crestUrl, 512) ||
    toSizedPngIconUrl(cmsData?.faviconUrl, 512) ||
    '/pwa-512x512.png';
  const brandMaskable512 =
    toMaskablePngIconUrl(cmsData?.crestUrl) ||
    toMaskablePngIconUrl(cmsData?.faviconUrl) ||
    '/pwa-maskable-512x512.png';

  const icons: MetadataRoute.Manifest['icons'] = [
    {
      src: brandIcon192,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: brandIcon512,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: brandMaskable512,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ];

  // If the brand crest/favicon wasn't a Cloudinary image or PNG (e.g., WebP/JPEG), include it as an extra icon
  const rawBrandLogo = cmsData?.crestUrl?.trim() || cmsData?.faviconUrl?.trim();
  if (rawBrandLogo && rawBrandLogo !== brandIcon192 && !rawBrandLogo.includes('res.cloudinary.com')) {
    icons.unshift({
      src: rawBrandLogo,
      sizes: 'any',
      purpose: 'any',
    });
  }

  return {
    id: '/',
    name: appName,
    short_name: shortName,
    description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    categories: ['education', 'productivity'],
    background_color: '#0f172a',
    theme_color: '#0f172a',
    icons,
    shortcuts: [
      {
        name: 'Teacher Portal',
        short_name: 'Teacher',
        description: 'Open Teacher mark entry, routine, and profile workspace',
        url: '/teacher/dashboard',
        icons: [{ src: brandIcon192, sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Student Portal',
        short_name: 'Student',
        description: 'Open Student results, fee receipts, and profile portal',
        url: '/student/portal',
        icons: [{ src: brandIcon192, sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Admin Console',
        short_name: 'Admin',
        description: 'Open Institutional ERP Admin Dashboard',
        url: '/custom/admin',
        icons: [{ src: brandIcon192, sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
