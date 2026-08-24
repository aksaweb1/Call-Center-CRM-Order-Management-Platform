import { AppShell } from '@/components/app-shell';

export default function RootRoutesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}