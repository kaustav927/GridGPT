import type { Metadata } from 'next';
import DashboardClient from './DashboardClient';
import GridSnapshot from '@/components/seo/GridSnapshot';
import HouseholdBar from '@/components/seo/HouseholdBar';

// The dashboard panels fetch live data client-side; the snapshot strip is regenerated every 5 minutes.
export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: 'GridGPT: Live Ontario Electricity Prices, Generation & Grid Map' },
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <DashboardClient topBar={<HouseholdBar />}>
      <GridSnapshot />
    </DashboardClient>
  );
}
