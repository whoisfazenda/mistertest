import { useState } from 'react';
import { Mail, CheckCircle2, Ticket, MessageSquare, Shield, ChevronRight } from 'lucide-react';
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
    <div className="space-y-5 pb-24 select-none">
      <div className="flex flex-col items-center justify-center pt-4 text-center space-y-2">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-white to-zinc-400 text-3xl font-black text-black shadow-[0_10px_30px_rgba(255,255,255,0.2)]">
            {user?.firstName ? user.firstName[0].toUpperCase() : 'M'}
          </div>
          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-black shadow-md">
            <CheckCircle2 size={14} className="fill-black text-white" />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-black text-white">{user?.firstName || 'Mister User'}</h2>
          <div className="text-xs text-txt3 font-medium">@{user?.username || 'user'}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
            <Mail size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-white">
              {emailBound ? 'Email привязан' : 'Привязать email'}
            </div>
            <div className="text-[11px] text-txt3">Для входа на сайте и уведомлений</div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleBindEmail}
          className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/10 text-xs font-bold text-white hover:bg-white/20 active:scale-95 transition-transform"
        >
          {emailBound ? 'Изменить' : 'Привязать'}
        </button>
      </div>

      <div className="space-y-2">
        <div
          onClick={() => {
            haptic('light');
            setPromoOpen(true);
          }}
          className="flex items-center justify-between p-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer transition-all"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20">
              <Ticket size={18} />
            </div>
            <div className="text-xs font-bold text-white">Активировать промокод</div>
          </div>
          <ChevronRight size={16} className="text-txt3" />
        </div>

        <a
          href={config?.supportUrl || 'https://t.me/misterfvpn_bot'}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between p-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer transition-all text-decoration-none"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300 border border-sky-500/20">
              <MessageSquare size={18} />
            </div>
            <div className="text-xs font-bold text-white">Помощь и поддержка</div>
          </div>
          <ChevronRight size={16} className="text-txt3" />
        </a>

        {user?.isAdmin && (
          <div
            onClick={() => {
              haptic('medium');
              onNavigateTab('admin');
            }}
            className="flex items-center justify-between p-4 rounded-2xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/15 cursor-pointer transition-all"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500 text-black font-black">
                <Shield size={18} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Панель администратора</div>
                <div className="text-[10px] text-purple-300">Настройки, статистика, переключатели</div>
              </div>
            </div>
            <ChevronRight size={16} className="text-purple-300" />
          </div>
        )}
      </div>

      <PromoModal isOpen={promoOpen} onClose={() => setPromoOpen(false)} />
      <ModernTopupModal isOpen={topupOpen} onClose={() => setTopupOpen(false)} />
    </div>
  );
}
