// Canonical site URL. The apex (gridgpt.ca) 307-redirects to www, so www is canonical.
export const SITE_URL = 'https://www.gridgpt.ca';
export const SITE_NAME = 'GridGPT';
export const SITE_TAGLINE = 'Live Ontario electricity prices, generation and grid data';

// Consumer-facing SEO pages. Single source for the sitemap, footer and cross-links.
export const SEO_PAGES = [
  { href: '/ontario-electricity-price', label: 'Electricity price right now' },
  { href: '/ontario-electricity-generation-by-fuel', label: 'Generation by fuel type' },
  { href: '/ontario-electricity-exports', label: 'Exports to the US & provinces' },
  { href: '/ontario-electricity-demand', label: 'Electricity demand today' },
] as const;
