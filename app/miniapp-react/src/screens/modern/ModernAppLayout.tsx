import { useState, useRef } from 'react';
import { Home, User as UserIcon, Shield, HelpCircle, ArrowLeft } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { haptic } from '../../lib/telegram';
import { ModernHomeScreen } from './ModernHomeScreen';
import { ModernProfileScreen } from './ModernProfileScreen';
import AdminScreen from '../AdminScreen';
import HistoryScreen from '../HistoryScreen';

export function ModernAppLayout() {
  const [activeTab, setActiveTab] = useState<'home' | 'profile' | 'admin' | 'history'>('home');
  const user = useAppStore((s) => s.user);
  const config = useAppStore((s) => s.config);
  const isAdmin = Boolean(user?.isAdmin);

  const mobileNavRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number>(0);

  const navItems = [
    { id: 'home', label: 'Главная', icon: Home },
    { id: 'profile', label: 'Профиль', icon: UserIcon },
    ...(isAdmin ? [{ id: 'admin', label: 'Админка', icon: Shield }] : []),
  ];

  const handleTabChange = (tab: any) => {
    haptic('light');
    setActiveTab(tab);
  };

  const updateMobileTabFromTouch = (clientX: number) => {
    if (!mobileNavRef.current) return;
    const rect = mobileNavRef.current.getBoundingClientRect();
    const touchX = clientX - rect.left;
    if (touchX < 0 || touchX > rect.width) return;
    const targetIdx = Math.max(0, Math.min(navItems.length - 1, Math.floor((touchX / rect.width) * navItems.length)));
    const target = navItems[targetIdx];
    if (target && target.id !== activeTab) {
      haptic('light');
      setActiveTab(target.id as any);
    }
  };

  return (
    <div
      className="min-h-dvh flex flex-col md:flex-row w-full text-[#0f172a] relative overflow-x-hidden font-sans"
      style={{
        background: 'linear-gradient(180deg, #60a5fa 0%, #93c5fd 35%, #e2e8f0 75%, #f1f5f9 100%)',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Cloud overlay decoration */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-white/20 to-white/60" />

      {/* DESKTOP SIDEBAR matching screenshot 1 */}
      <aside className="hidden md:flex flex-col justify-between w-64 p-6 shrink-0 relative z-10">
        <div className="space-y-6">
          {/* Brand */}
          <div className="text-xl font-black tracking-wider text-[#0f172a]">
            {config?.appName || 'MISTER VPN'}
          </div>

          {/* User Profile Card */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#22c55e] text-white font-bold text-lg shadow-sm">
              {user?.firstName ? user.firstName[0].toUpperCase() : 'M'}
            </div>
            <div className="leading-tight">
              <div className="font-bold text-xs text-[#0f172a]">{user?.firstName || 'mister fazenda'}</div>
              <div className="text-[11px] text-[#64748b]">@{user?.username || 'whoisfazenda'}</div>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="space-y-2">
            {[
              { id: 'home', label: 'Главная', icon: Home },
              { id: 'profile', label: 'Профиль', icon: UserIcon },
              ...(isAdmin ? [{ id: 'admin', label: 'Админка', icon: Shield }] : []),
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabChange(item.id)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 rounded-full font-bold text-xs transition-all ${
                    isActive
                      ? 'bg-white text-[#0f172a] shadow-sm'
                      : 'text-[#334155] hover:bg-white/40'
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Help */}
        <a
          href={config?.supportUrl || 'https://t.me/mistervpnsup_bot'}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-xs text-[#475569] hover:text-[#0f172a] p-2"
        >
          <HelpCircle size={15} />
          <span>Помощь</span>
        </a>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 px-4 pt-4 md:px-8 md:pt-6 max-w-xl mx-auto w-full relative z-10">
        {activeTab === 'history' && (
          <div className="pb-4">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2 text-xs font-bold text-[#475569] hover:text-[#0f172a] mb-3"
            >
              <ArrowLeft size={16} />
              <span>Назад на главную</span>
            </button>
            <HistoryScreen />
          </div>
        )}

        {activeTab === 'home' && <ModernHomeScreen onNavigateTab={handleTabChange} />}
        {activeTab === 'profile' && <ModernProfileScreen onNavigateTab={handleTabChange} />}
        {activeTab === 'admin' && <AdminScreen />}
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 px-4 pointer-events-auto select-none"
        style={{ paddingBottom: 'calc(10px + var(--safe-bottom, 10px))' }}
      >
        <div
          ref={mobileNavRef}
          onTouchStart={(e) => {
            touchStartXRef.current = e.touches[0].clientX;
            updateMobileTabFromTouch(e.touches[0].clientX);
          }}
          onTouchMove={(e) => updateMobileTabFromTouch(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
            const currentIdx = navItems.findIndex((i) => i.id === activeTab);
            if (Math.abs(deltaX) > 25) {
              if (deltaX < -25 && currentIdx < navItems.length - 1) {
                handleTabChange(navItems[currentIdx + 1].id);
              } else if (deltaX > 25 && currentIdx > 0) {
                handleTabChange(navItems[currentIdx - 1].id);
              }
            }
          }}
          className="relative mx-auto flex h-[62px] max-w-md items-center justify-around rounded-[26px] bg-white/95 p-1 shadow-lg backdrop-blur-xl border border-white/60 cursor-pointer"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={`relative flex h-full flex-1 flex-col items-center justify-center rounded-[20px] transition-all duration-200 active:scale-95 ${
                  isActive
                    ? 'bg-[#38bdf8] text-white shadow-xs'
                    : 'text-[#64748b] hover:text-[#0f172a]'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'scale-110' : ''}`} />
                <span className={`mt-0.5 text-[10px] font-bold ${isActive ? 'text-white' : 'text-[#64748b]'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
