import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../lib/telegram';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      haptic('light');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Sheet Container */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative z-10 max-h-[88vh] w-full max-w-md overflow-hidden rounded-t-[28px] border-t border-white/[0.15] bg-[#0c0c10] p-5 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.8)]"
          >
            {/* Grab Handle */}
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/25" />

            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              {title ? (
                <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
              ) : (
                <div />
              )}
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-txt2 transition-colors hover:bg-white/20 hover:text-white"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            {/* Content with smooth scrolling */}
            <div className="max-h-[calc(88vh-110px)] overflow-y-auto overscroll-contain pr-1">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
