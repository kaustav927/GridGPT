import type { Metadata } from "next";
import localFont from "next/font/local";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import "@blueprintjs/select/lib/css/blueprint-select.css";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "GridGPT",
  description: "Real-time electricity grid monitoring and AI-powered analytics for Ontario",
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
      </body>
    </html>
  );
}
