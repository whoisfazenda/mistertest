import { useRef } from 'react';
import type { TouchEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { getTabs, tabIndexFromPath } from '../lib/tabs';
import { useTabFlow } from './TabFlow';
import { haptic } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';

export function BottomNav() {
  const location = useLocation();
  const flow = useTabFlow();
  const user = useAppStore((s) => s.user);
  const isAdmin = Boolean(user?.isAdmin);
  const tabs = getTabs(isAdmin);

  const active = Math.max(0, tabIndexFromPath(location.pathname, isAdmin));
  const containerRef = useRef<HTMLDivElement>(null);
  const lastIndexRef = useRef<number>(active);
  const touchStartXRef = useRef<number>(0);

  const updateTabFromTouch = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const touchX = clientX - rect.left;
    if (touchX < 0 || touchX > rect.width) return;
    const targetIdx = Math.max(0, Math.min(tabs.length - 1, Math.floor((touchX / rect.width) * tabs.length)));
    if (targetIdx !== lastIndexRef.current) {
      lastIndexRef.current = targetIdx;
      haptic('light');
      flow?.goTo(targetIdx);
    }
  };

  const handleTouchStart = (e: TouchEvent) => {
    lastIndexRef.current = active;
    touchStartXRef.current = e.touches[0].clientX;
    updateTabFromTouch(e.touches[0].clientX);
  };

  const handleTouchMove = (e: TouchEvent) => {
    updateTabFromTouch(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    if (Math.abs(deltaX) > 25) {
      if (deltaX < -25 && active < tabs.length - 1) {
        flow?.goTo(active + 1);
      } else if (deltaX > 25 && active > 0) {
        flow?.goTo(active - 1);
      }
    }
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-3 pointer-events-auto select-none"
      style={{ paddingBottom: 'calc(10px + var(--safe-bottom, 10px))' }}
    >
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative mx-auto flex h-[64px] max-w-md items-center justify-around rounded-[26px] border border-white/[0.12] bg-[#0c0c10]/95 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl cursor-pointer"
      >
        {tabs.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = idx === active;
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => {
                haptic('light');
                flow?.goTo(idx);
              }}
              className={`relative flex h-full flex-1 flex-col items-center justify-center rounded-[20px] transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'bg-white/[0.14] text-white shadow-sm border border-white/[0.12]'
                  : 'text-txt2 hover:text-white/80'
              }`}
            >
              <Icon className={`h-5 w-5 transition-transform duration-200 ${isActive ? 'scale-110 text-white' : ''}`} />
              <span className={`mt-0.5 text-[10px] font-semibold tracking-tight ${isActive ? 'text-white' : 'text-txt2'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
