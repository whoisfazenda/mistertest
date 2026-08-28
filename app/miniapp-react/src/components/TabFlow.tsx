import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getTabs, tabIndexFromPath } from '../lib/tabs';
import { haptic } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';

interface TabFlowValue {
  activeTab: number;
  goTo: (index: number) => void;
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

  const goTo = (index: number): void => {
    const next = Math.max(0, Math.min(tabs.length - 1, index));
    haptic('light');
    if (tabs[next] && tabs[next].path !== location.pathname) {
      navigate(tabs[next].path, { replace: true });
    }
  };

  const value = useMemo(() => ({ activeTab: activeIndex, goTo }), [activeIndex, tabs]);
  return <TabFlowContext.Provider value={value}>{children}</TabFlowContext.Provider>;
}

export function TabPager({ pages }: { pages: ReactNode[] }) {
  const location = useLocation();
  const user = useAppStore((s) => s.user);
  const isAdmin = Boolean(user?.isAdmin);
  const active = Math.max(0, Math.min(pages.length - 1, tabIndexFromPath(location.pathname, isAdmin)));

  return (
    <div className="w-full pb-24 transition-opacity duration-150">
      {pages[active]}
    </div>
  );
}
