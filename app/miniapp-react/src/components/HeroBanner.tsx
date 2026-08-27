import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface HeroBannerProps {
  badge?: string;
  title: string;
  subtitle?: string;
  extra?: ReactNode;
  className?: string;
  imageName?: string;
}

export function HeroBanner({
  title,
  subtitle,
  extra,
  className = '',
}: HeroBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className={`relative overflow-hidden rounded-[26px] border border-white/[0.14] bg-gradient-to-b from-[#161622]/95 via-[#0e0e14]/95 to-[#08080c]/95 p-5 text-center shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-2xl ${className}`}
    >
      {/* Top subtle ambient highlight flare */}
      <div className="pointer-events-none absolute -top-12 left-1/2 h-24 w-48 -translate-x-1/2 rounded-full bg-white/[0.08] blur-2xl" />
      <div className="pointer-events-none absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-white/[0.03] blur-xl" />

      {/* Foreground Content - Centered */}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-1.5 text-center">
        <h1 className="text-[23px] font-black leading-tight tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-100 to-zinc-300">
          {title}
        </h1>

        {subtitle && (
          <p className="text-[12.5px] leading-relaxed text-zinc-400 font-medium max-w-[90%] mx-auto">
            {subtitle}
          </p>
        )}

        {extra && <div className="pt-2 w-full">{extra}</div>}
      </div>
    </motion.div>
  );
}
