import { useState } from 'react';
import { Home, Users, User as UserIcon, Shield, HelpCircle, ArrowLeft } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { haptic } from '../../lib/telegram';
import { ModernHomeScreen } from './ModernHomeScreen';
import { ModernReferralScreen } from './ModernReferralScreen';
import { ModernProfileScreen } from './ModernProfileScreen';
import AdminScreen from '../AdminScreen';
import HistoryScreen from '../HistoryScreen';

export function ModernAppLayout() {
  const [activeTab, setActiveTab] = useState<'home' | 'referral' | 'profile' | 'admin' | 'history'>('home');
  const user = useAppStore((s) => s.user);
  const config = useAppStore((s) => s.config);
  const isAdmin = Boolean(user?.isAdmin);

  const handleTabChange = (tab: any) => {
    haptic('light');
    setActiveTab(tab);
  };

  return (
    <div className="min-h-dvh flex flex-col md:flex-row w-full max-w-5xl mx-auto text-white">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col justify-between w-64 p-6 border-r border-white/10 bg-[#07070a]/90 backdrop-blur-2xl shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-black font-black text-xl shadow-lg">
              M
            </div>
            <div>
              <div className="font-extrabold text-sm tracking-tight">{config?.appName || 'MISTER VPN'}</div>
              <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">● 10 Gbps Active</div>
            </div>
          </div>

          <nav className="space-y-1.5">
            {[
              { id: 'home', label: 'Главная', icon: Home },
              { id: 'referral', label: 'Заработок', icon: Users },
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
                  className={`flex w-full items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs transition-all ${
                    isActive
                      ? 'bg-white text-black shadow-lg'
                      : 'text-txt2 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <a
          href={config?.supportUrl || 'https://t.me/misterfvpn_bot'}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 text-xs text-txt3 hover:text-white p-2 rounded-xl"
        >
          <HelpCircle size={16} />
          <span>Помощь</span>
        </a>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 px-4 pt-4 md:px-8 md:pt-6 max-w-xl mx-auto w-full">
        {activeTab === 'history' && (
          <div className="pb-4">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2 text-xs font-bold text-txt2 hover:text-white mb-3"
            >
              <ArrowLeft size={16} />
              <span>Назад на главную</span>
            </button>
            <HistoryScreen />
          </div>
        )}

        {activeTab === 'home' && <ModernHomeScreen onNavigateTab={handleTabChange} />}
        {activeTab === 'referral' && <ModernReferralScreen />}
        {activeTab === 'profile' && <ModernProfileScreen onNavigateTab={handleTabChange} />}
        {activeTab === 'admin' && <AdminScreen />}
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 px-3 pointer-events-auto select-none"
        style={{ paddingBottom: 'calc(10px + var(--safe-bottom, 10px))' }}
      >
        <div className="relative mx-auto flex h-[64px] max-w-md items-center justify-around rounded-[26px] border border-white/[0.12] bg-[#0c0c10]/95 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          {[
            { id: 'home', label: 'Главная', icon: Home },
            { id: 'referral', label: 'Заработок', icon: Users },
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
                className={`relative flex h-full flex-1 flex-col items-center justify-center rounded-[20px] transition-all duration-200 active:scale-95 ${
                  isActive
                    ? 'bg-white text-black shadow-md'
                    : 'text-txt2 hover:text-white/80'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'scale-110' : ''}`} />
                <span className={`mt-0.5 text-[10px] font-bold ${isActive ? 'text-black' : 'text-txt2'}`}>
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
