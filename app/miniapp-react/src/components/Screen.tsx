import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EASE, pageVariants } from '../lib/format';
import { haptic, hideBackButton, showBackButton } from '../lib/telegram';
import { TabStaticContext } from './TabFlow';

export function Screen({ children }: { children: ReactNode }) {
  const staticTab = useContext(TabStaticContext);
  if (staticTab) return <div>{children}</div>;
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="enter"
      exit="exit"
      transition={{ duration: 0.35, ease: EASE }}
    >
      {children}
    </motion.div>
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
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          haptic('light');
          navigate(-1);
        }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04]"
        aria-label="Назад"
      >
        <ChevronLeft size={20} strokeWidth={1.5} />
      </motion.button>
      <div className="min-w-0">
        <h1 className="truncate text-[22px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="truncate text-[13px] text-txt2">{subtitle}</p>}
      </div>
    </div>
  );
}
