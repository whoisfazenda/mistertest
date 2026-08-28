import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { haptic, hideBackButton, showBackButton } from '../lib/telegram';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="w-full animate-in fade-in duration-200">
      {children}
    </div>
  );
}

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
}

export function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  const navigate = useNavigate();

  useEffect(() => {
    showBackButton(() => navigate(-1));
    return hideBackButton;
  }, [navigate]);

  return (
    <div className="mb-5 flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          haptic('light');
          navigate(-1);
        }}
        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-txt active:scale-95"
        aria-label="Назад"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="text-xs text-txt2">{subtitle}</p>}
      </div>
    </div>
  );
}
