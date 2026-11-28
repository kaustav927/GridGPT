import type { Metadata } from 'next';
import AboutContent from './AboutContent';

export const metadata: Metadata = {
  title: { absolute: 'About GridGPT: How the Ontario Grid Dashboard Works' },
  description:
    'How GridGPT streams IESO public data through Kafka (Redpanda) into ClickHouse and serves a real-time Ontario electricity dashboard with a Claude-powered text-to-SQL assistant.',
  alternates: { canonical: '/about' },
  openGraph: { url: '/about', title: 'About GridGPT' },
};

export default function AboutPage() {
  return <AboutContent />;
}
