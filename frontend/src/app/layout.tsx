import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import "@blueprintjs/select/lib/css/blueprint-select.css";
import "./globals.css";
import JsonLd from "@/components/seo/JsonLd";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const DESCRIPTION =
  "Live Ontario electricity data from the IESO: wholesale prices by zone, household Time-of-Use rates, generation by fuel type, exports to the US and demand, on a real-time map with an AI assistant.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}: ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Ontario electricity price",
    "Ontario electricity price right now",
    "IESO",
    "Ontario grid",
    "time-of-use rates Ontario",
    "Ontario electricity exports",
    "Ontario fuel mix",
    "Ontario electricity demand",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_CA",
    url: "/",
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: DESCRIPTION,
      inLanguage: "en-CA",
    },
    {
      "@type": "Dataset",
      "@id": `${SITE_URL}/#dataset`,
      name: "Ontario real-time electricity market data",
      description:
        "Five-minute zonal electricity prices, generator output by fuel type, intertie flows and demand for Ontario, Canada, collected from IESO public reports.",
      url: SITE_URL,
      isAccessibleForFree: true,
      spatialCoverage: { "@type": "Place", name: "Ontario, Canada" },
      temporalCoverage: "2025/..",
      creator: { "@type": "Person", name: "Kaustav Sharma" },
      isBasedOn: "https://reports-public.ieso.ca/public/",
      variableMeasured: [
        "Zonal electricity price ($/MWh)",
        "Generation by fuel type (MW)",
        "Intertie flow (MW)",
        "Ontario demand (MW)",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bp5-dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bp5-dark antialiased`}
      >
        {children}
        <JsonLd data={SITE_JSON_LD} />
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "a9eb3c5740eb49fe825b6afacc65d70e"}'
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
