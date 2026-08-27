import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { haptic } from '../lib/telegram';

interface GradientButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function GradientButton({
  children,
  onClick,
  disabled,
  loading,
  className = '',
  variant = 'primary',
}: GradientButtonProps) {
  const variantStyles = {
    primary:
      'bg-gradient-to-b from-white to-zinc-200 text-black shadow-[0_0_20px_rgba(255,255,255,0.18)] hover:to-zinc-300',
    secondary:
      'bg-white/[0.08] text-white border border-white/[0.12] hover:bg-white/[0.12]',
    danger:
      'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/20',
  }[variant];

  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={() => {
        if (disabled || loading) return;
        haptic('light');
        onClick?.();
      }}
      disabled={disabled || loading}
      className={`flex h-14 w-full items-center justify-center gap-2 rounded-btn font-semibold tracking-wide transition-all active:opacity-90 disabled:pointer-events-none disabled:opacity-40 ${variantStyles} ${className}`}
    >
      {loading ? <Spinner variant={variant} /> : children}
    </motion.button>
  );
}

interface GhostButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function GhostButton({ children, onClick, className = '' }: GhostButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        haptic('light');
        onClick?.();
      }}
      className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] font-medium text-txt transition-colors hover:bg-white/[0.08] ${className}`}
    >
      {children}
    </motion.button>
  );
}

function Spinner({ variant = 'primary' }: { variant?: 'primary' | 'secondary' | 'danger' }) {
  const spinnerBorder = variant === 'primary' ? 'border-black/20 border-t-black' : 'border-white/20 border-t-white';
  return (
    <span className={`h-5 w-5 animate-spin rounded-full border-2 ${spinnerBorder}`} />
  );
}

