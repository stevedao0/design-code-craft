import React from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth';

function storageKey(userId: string | null | undefined): string {
  // Per-user namespace so logout/login as another account does not
  // leak one user's theme preference onto another.
  return userId ? `vcpmc.theme.dark.${userId}` : 'vcpmc.theme.dark';
}

export function ThemeToggle({ variant = 'topbar' }: { variant?: 'topbar' | 'floating' }) {
  const { currentUser } = useAuth();
  const key = storageKey(currentUser?.id ?? currentUser?.email ?? null);
  const [dark, setDark] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(key) === '1';
  });

  // Reload theme preference when active user changes.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setDark(localStorage.getItem(key) === '1');
  }, [key]);

  React.useEffect(() => {
    const el = document.documentElement;
    if (dark) el.classList.add('theme-obsidian');
    else el.classList.remove('theme-obsidian');
    localStorage.setItem(key, dark ? '1' : '0');
  }, [dark, key]);

  const label = 'Đổi giao diện';
  const title = dark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối';

  if (variant === 'floating') {
    return (
      <button
        type="button"
        onClick={() => setDark((v) => !v)}
        className="theme-toggle"
        aria-label={label}
        title={title}>
        {dark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setDark((v) => !v)}
      aria-label={label}
      title={title}
      className="relative h-9 w-9 inline-flex items-center justify-center rounded-lg text-fg-secondary hover:bg-surface-subtle hover:text-fg-primary transition-colors">
      {dark ? <SunIcon className="h-[17px] w-[17px]" /> : <MoonIcon className="h-[17px] w-[17px]" />}
    </button>
  );
}
