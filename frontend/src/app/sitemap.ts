import type { MetadataRoute } from 'next';
import { SEO_PAGES, SITE_URL } from '@/lib/site';
import { PRICING_ZONES } from '@/lib/grid-data';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'always', priority: 1 },
    ...SEO_PAGES.map((p) => ({
      url: `${SITE_URL}${p.href}`,
      lastModified: now,
      changeFrequency: 'hourly' as const,
      priority: 0.9,
    })),
    ...PRICING_ZONES.map((z) => ({
      url: `${SITE_URL}/electricity-price/${z.toLowerCase()}`,
      lastModified: now,
      changeFrequency: 'hourly' as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];
}
