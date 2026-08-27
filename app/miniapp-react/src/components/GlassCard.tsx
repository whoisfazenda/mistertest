import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { staggerContainer } from '../lib/format';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function GlassCard({
  children,
  className = '',
  onClick,
  interactive,
}: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-xl transition-all duration-200 ${
        interactive
          ? 'cursor-pointer hover:-translate-y-0.5 hover:bg-white/[0.05]'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Wrapper that staggers its direct motion children on mount. */
export function StaggerGroup({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-6 px-1 text-[15px] font-semibold uppercase tracking-wider text-txt2">
      {children}
    </h2>
  );
}
