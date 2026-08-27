import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { hapticNotify } from '../lib/telegram';

interface SwipeToDeleteProps {
  id: string;
  onDelete: (id: string) => void;
  children: ReactNode;
}

const DELETE_THRESHOLD = -96;

export function SwipeToDelete({ id, onDelete, children }: SwipeToDeleteProps) {
  const x = useMotionValue(0);
  const bgOpacity = useTransform(x, [-128, DELETE_THRESHOLD], [1, 0.4]);
  const draggingRef = useRef(false);
  const startX = useRef(0);

  return (
    <div className="relative overflow-hidden rounded-[20px]">
      <motion.div
        style={{ opacity: bgOpacity }}
        className="absolute inset-0 flex items-center justify-end rounded-[20px] border border-error/30 bg-error/15 pr-5"
      >
        <Trash2 size={22} strokeWidth={1.5} className="text-error" />
      </motion.div>
      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: -160, right: 0 }}
        dragElastic={0.08}
        dragMomentum={false}
        onDragStart={(_, info) => {
          draggingRef.current = true;
          startX.current = info.point.x;
        }}
        onDragEnd={(_, info) => {
          draggingRef.current = false;
          if (info.offset.x < DELETE_THRESHOLD) {
            hapticNotify('success');
            onDelete(id);
          }
        }}
      >
        <div
          onTouchStart={(e) => {
            startX.current = e.touches[0].clientX;
          }}
          className="touch-pan-y"
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}
