import SettingsSubNav from '@/components/layout/SettingsSubNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-w-0">
      <SettingsSubNav />
      {children}
    </div>
  );
}
