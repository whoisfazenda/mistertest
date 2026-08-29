import { createContext, useContext, useMemo, useRef, useState, useEffect } from 'react';
import type { ReactNode, TouchEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getTabs, tabIndexFromPath } from '../lib/tabs';
import { haptic } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';

interface TabFlowValue {
  activeTab: number;
  goTo: (index: number) => void;
  direction: number;
}

const TabFlowContext = createContext<TabFlowValue | null>(null);

export function useTabFlow(): TabFlowValue | null {
  return useContext(TabFlowContext);
}

export function TabFlowProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const isAdmin = Boolean(user?.isAdmin);
  const tabs = getTabs(isAdmin);

  const activeIndex = Math.max(0, tabIndexFromPath(location.pathname, isAdmin));
  const [prevIndex, setPrevIndex] = useState(activeIndex);

  useEffect(() => {
    setPrevIndex(activeIndex);
  }, [activeIndex]);

  const direction = activeIndex > prevIndex ? 1 : -1;

  const goTo = (index: number): void => {
    const next = Math.max(0, Math.min(tabs.length - 1, index));
    if (next === activeIndex) return;
    haptic('light');
    if (tabs[next] && tabs[next].path !== location.pathname) {
      navigate(tabs[next].path, { replace: true });
    }
  };

  const value = useMemo(() => ({ activeTab: activeIndex, goTo, direction }), [activeIndex, direction, tabs]);
  return <TabFlowContext.Provider value={value}>{children}</TabFlowContext.Provider>;
}

export function TabPager({ pages }: { pages: ReactNode[] }) {
  const location = useLocation();
  const user = useAppStore((s) => s.user);
  const tabFlow = useTabFlow();
  const isAdmin = Boolean(user?.isAdmin);
  const active = Math.max(0, Math.min(pages.length - 1, tabIndexFromPath(location.pathname, isAdmin)));

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const deltaTime = Date.now() - touchStartTime.current;

    // Must be predominantly horizontal swipe
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && deltaTime < 600) {
      if (deltaX < -40) {
        // Swiped Left -> go Next
        if (active < pages.length - 1) {
          tabFlow?.goTo(active + 1);
        }
      } else if (deltaX > 40) {
        // Swiped Right -> go Prev
        if (active > 0) {
          tabFlow?.goTo(active - 1);
        }
      }
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="w-full pb-24 overflow-x-hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0.9, x: (tabFlow?.direction ?? 1) * 14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0.9, x: (tabFlow?.direction ?? 1) * -14 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          className="w-full"
        >
          {pages[active]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
