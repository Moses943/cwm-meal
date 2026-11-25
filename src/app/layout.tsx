import './globals.css';
import type { Metadata, Viewport } from 'next';
import Background from './background';
export const metadata: Metadata = {
  title: 'CWEMS – Cornerstone Widows Ministry', description: 'Empowerment & Monitoring System',
  manifest: '/manifest.json', icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2e7d32' };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en-ZM"><body><Background />{children}</body></html>;
}
