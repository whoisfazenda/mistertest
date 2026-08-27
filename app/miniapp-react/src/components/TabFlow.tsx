import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { getTabs, isMainTabPath, tabIndexFromPath } from '../lib/tabs';
import { haptic } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';

interface TabFlowValue {
  progress: ReturnType<typeof useMotionValue<number>>;
  compact: boolean;
  goTo: (index: number, fromDrag?: boolean) => void;
}

const TabFlowContext = createContext<TabFlowValue | null>(null);
export const TabStaticContext = createContext(false);

export function useTabFlow(): TabFlowValue | null {
  return useContext(TabFlowContext);
}

export function TabFlowProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const isAdmin = Boolean(user?.isAdmin);
  const tabs = getTabs(isAdmin);

  const initialIndex = Math.max(0, tabIndexFromPath(location.pathname, isAdmin));
  const progress = useMotionValue(initialIndex);
  const [compact, setCompact] = useState(false);
  const lastHaptic = useRef(-1);

  const goTo = (index: number, fromDrag = false): void => {
    const next = Math.max(0, Math.min(tabs.length - 1, index));
    if (!fromDrag) {
      void animate(progress, next, { type: 'spring', stiffness: 420, damping: 36, mass: 0.6 });
    }
    if (tabs[next] && tabs[next].path !== location.pathname) {
      navigate(tabs[next].path, { replace: true });
    }
  };

  useEffect(() => {
    if (!isMainTabPath(location.pathname, isAdmin)) return;
    const index = tabIndexFromPath(location.pathname, isAdmin);
    if (index >= 0 && Math.abs(progress.get() - index) > 0.04) {
      void animate(progress, index, { type: 'spring', stiffness: 420, damping: 36, mass: 0.6 });
    }
  }, [location.pathname, progress, isAdmin]);

  useMotionValueEvent(progress, 'change', (value) => {
    const nearest = Math.round(value);
    if (nearest !== lastHaptic.current && Math.abs(value - nearest) < 0.04) {
      lastHaptic.current = nearest;
      haptic('light');
    }
  });

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = (): void => {
      const y = window.scrollY;
      if (y > lastY + 12 && y > 30) setCompact(true);
      else if (y < lastY - 8) setCompact(false);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const value = useMemo(() => ({ progress, compact, goTo }), [progress, compact, tabs]);
  return <TabFlowContext.Provider value={value}>{children}</TabFlowContext.Provider>;
}

export function TabPager({ pages }: { pages: ReactNode[] }) {
  const flow = useTabFlow();
  const location = useLocation();
  const user = useAppStore((s) => s.user);
  const isAdmin = Boolean(user?.isAdmin);
  const initialIndex = Math.max(0, tabIndexFromPath(location.pathname, isAdmin));
  const [active, setActive] = useState(initialIndex);

  useEffect(() => {
    const idx = tabIndexFromPath(location.pathname, isAdmin);
    if (idx >= 0 && idx < pages.length) {
      setActive(idx);
    }
  }, [location.pathname, isAdmin, pages.length]);

  useMotionValueEvent(flow?.progress ?? useMotionValue(0), 'change', (v) => {
    const idx = Math.max(0, Math.min(pages.length - 1, Math.round(v)));
    setActive(idx);
  });

  return (
    <div className="w-full pb-24">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          className="w-full"
        >
          {pages[active]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
