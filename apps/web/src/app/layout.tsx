import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { CallProvider } from '@/components/call-context';

export const metadata: Metadata = {
  title: 'Call Center CRM',
  description: 'Call center CRM & order management platform',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AuthProvider><CallProvider>{children}</CallProvider></AuthProvider></body>
    </html>
  );
}