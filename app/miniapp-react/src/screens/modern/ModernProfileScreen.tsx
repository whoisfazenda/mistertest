import { useState } from 'react';
import { Ticket, MessageSquare, Shield, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { haptic, hapticNotify, showAlert } from '../../lib/telegram';
import { PromoModal } from '../../components/PromoModal';
import { ModernTopupModal } from './ModernTopupModal';

interface ModernProfileScreenProps {
  onNavigateTab: (tab: string) => void;
}

export function ModernProfileScreen({ onNavigateTab }: ModernProfileScreenProps) {
  const user = useAppStore((s) => s.user);
  const config = useAppStore((s) => s.config);

  const [promoOpen, setPromoOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [emailBound, setEmailBound] = useState(false);

  const handleBindEmail = () => {
    haptic('medium');
    const email = prompt('Введите ваш Email для привязки:');
    if (email && email.includes('@')) {
      setEmailBound(true);
      hapticNotify('success');
      showAlert(`Email ${email} успешно привязан!`);
    }
  };

  return (
    <div className="space-y-4 pb-24 select-none max-w-xl mx-auto">
      {/* Big Centered Avatar matching screenshot 3 */}
      <div className="flex flex-col items-center justify-center pt-6 text-center space-y-2">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#22c55e] text-3xl font-black text-white shadow-lg">
          {user?.firstName ? user.firstName[0].toUpperCase() : 'M'}
        </div>

        <div>
          <h2 className="text-lg font-black text-[#0f172a]">{user?.firstName || 'mister fazenda'}</h2>
          <div className="text-xs text-[#38bdf8] font-semibold flex items-center justify-center gap-1">
            <span>✓</span>
            <span>@{user?.username || 'whoisfazenda'}</span>
          </div>
        </div>
      </div>

      {/* Email Bind Card matching screenshot 3 */}
      <div className="rounded-2xl bg-white/80 backdrop-blur-md p-4 shadow-sm border border-white/60 flex items-center justify-between">
        <div className="text-xs text-[#64748b]">
          {emailBound ? 'Email привязан' : 'Привяжите email'}
        </div>

        <button
          type="button"
          onClick={handleBindEmail}
          className="px-4 py-1.5 rounded-xl bg-white border border-[#e2e8f0] text-xs font-bold text-[#0f172a] hover:bg-[#f8fafc] shadow-xs active:scale-95 transition-all"
        >
          {emailBound ? 'Изменить' : 'Привязать'}
        </button>
      </div>

      {/* Menu items */}
      <div className="space-y-2 pt-2">
        <div
          onClick={() => {
            haptic('light');
            setPromoOpen(true);
          }}
          className="flex items-center justify-between p-4 rounded-2xl bg-white/80 backdrop-blur-md shadow-xs border border-white/60 cursor-pointer hover:bg-white transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Ticket size={18} />
            </div>
            <div className="text-xs font-bold text-[#0f172a]">Активировать промокод</div>
          </div>
          <ChevronRight size={16} className="text-[#94a3b8]" />
        </div>

        <a
          href={config?.supportUrl || 'https://t.me/mistervpnsup_bot'}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between p-4 rounded-2xl bg-white/80 backdrop-blur-md shadow-xs border border-white/60 cursor-pointer hover:bg-white transition-all text-decoration-none"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <MessageSquare size={18} />
            </div>
            <div className="text-xs font-bold text-[#0f172a]">Помощь и поддержка</div>
          </div>
          <ChevronRight size={16} className="text-[#94a3b8]" />
        </a>

        {user?.isAdmin && (
          <div
            onClick={() => {
              haptic('medium');
              onNavigateTab('admin');
            }}
            className="flex items-center justify-between p-4 rounded-2xl bg-purple-50 shadow-xs border border-purple-200 cursor-pointer hover:bg-purple-100 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white font-black">
                <Shield size={18} />
              </div>
              <div>
                <div className="text-xs font-bold text-purple-950">Панель администратора</div>
                <div className="text-[10px] text-purple-700">Настройки, статистика, переключатели</div>
              </div>
            </div>
            <ChevronRight size={16} className="text-purple-700" />
          </div>
        )}
      </div>

      <PromoModal isOpen={promoOpen} onClose={() => setPromoOpen(false)} />
      <ModernTopupModal isOpen={topupOpen} onClose={() => setTopupOpen(false)} />
    </div>
  );
}
