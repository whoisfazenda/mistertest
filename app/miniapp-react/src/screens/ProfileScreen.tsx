import { motion } from 'framer-motion';
import {
  ChevronRight,
  Crown,
  History,
  LifeBuoy,
  Plus,
  Tag,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CountUp } from '../components/Controls';
import { GlassCard, StaggerGroup } from '../components/GlassCard';
import { HeroBanner } from '../components/HeroBanner';
import { PullToRefresh } from '../components/PullToRefresh';
import { Screen } from '../components/Screen';
import { TopupModal } from '../components/TopupModal';
import { PromoModal } from '../components/PromoModal';
import { staggerItem } from '../lib/format';
import { haptic, openLink } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';

export default function ProfileScreen() {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const config = useAppStore((s) => s.config);
  const refresh = useAppStore((s) => s.refresh);

  const [topupOpen, setTopupOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);

  const openSupport = () => {
    haptic('light');
    if (config?.supportUrl) {
      openLink(config.supportUrl);
    } else {
      openLink('https://t.me/misterfvpn_bot');
    }
  };

  return (
    <Screen>
      <PullToRefresh onRefresh={refresh}>
        <StaggerGroup className="space-y-4 pt-1">
          {/* Hero Banner */}
          <motion.div variants={staggerItem}>
            <HeroBanner
              imageName="profile.png"
              badge="Личный кабинет"
              title="Профиль и кошелёк"
              subtitle="Управление балансом, бонусами и настройками аккаунта"
            />
          </motion.div>

          {/* User Info Card */}
          <motion.div variants={staggerItem}>
            <GlassCard className="flex items-center gap-4 p-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-xl font-bold text-white shadow-inner">
                {user?.firstName ? user.firstName[0].toUpperCase() : 'M'}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white truncate">
                    {user?.firstName || 'Пользователь'} {user?.lastName || ''}
                  </h3>
                  {user?.isAdmin && (
                    <span className="flex items-center gap-1 rounded-full border border-white/20 bg-white/15 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">
                      <Crown size={10} />
                      ADMIN
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-txt2 truncate">
                  @{user?.username || `id${user?.telegramId || ''}`}
                </p>
              </div>
            </GlassCard>
          </motion.div>

          {/* Wallet Balance Card */}
          <motion.div variants={staggerItem}>
            <GlassCard className="relative overflow-hidden p-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-txt2">
                    Баланс аккаунта
                  </span>
                  <div className="mt-1 font-mono text-3xl font-extrabold text-white tabular-nums">
                    <CountUp value={user?.balance || 0} render={(v) => `${Math.round(v)} ₽`} />
                  </div>
                </div>

                <button
                  onClick={() => setTopupOpen(true)}
                  className="flex items-center gap-1.5 rounded-btn border border-white/20 bg-white px-4 py-2.5 font-bold text-black text-xs shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all hover:bg-zinc-200 active:scale-[0.97]"
                >
                  <Plus size={16} />
                  <span>Пополнить</span>
                </button>
              </div>
            </GlassCard>
          </motion.div>

          {/* Admin Hub Access (if admin) */}
          {user?.isAdmin && (
            <motion.div variants={staggerItem}>
              <GlassCard
                interactive
                onClick={() => {
                  haptic('medium');
                  navigate('/admin');
                }}
                className="flex items-center justify-between border-white/30 bg-white/[0.06] p-4 shadow-[0_0_24px_rgba(255,255,255,0.1)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white">
                    <Crown size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Панель администратора</h4>
                    <p className="text-xs text-txt2">Управление пользователями, тарифами и статистикой</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-white" />
              </GlassCard>
            </motion.div>
          )}

          {/* Quick Menu Actions */}
          <motion.div variants={staggerItem}>
            <GlassCard className="space-y-1 p-2">
              <button
                onClick={() => setPromoOpen(true)}
                className="flex w-full items-center gap-3.5 rounded-xl p-3 text-left transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white">
                  <Tag size={18} />
                </div>
                <span className="flex-1 text-sm font-medium text-white">Активировать промокод</span>
                <ChevronRight size={16} className="text-txt2" />
              </button>

              <button
                onClick={() => navigate('/history')}
                className="flex w-full items-center gap-3.5 rounded-xl p-3 text-left transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white">
                  <History size={18} />
                </div>
                <span className="flex-1 text-sm font-medium text-white">История платежей</span>
                <ChevronRight size={16} className="text-txt2" />
              </button>

              <button
                onClick={openSupport}
                className="flex w-full items-center gap-3.5 rounded-xl p-3 text-left transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white">
                  <LifeBuoy size={18} />
                </div>
                <span className="flex-1 text-sm font-medium text-white">Служба поддержки</span>
                <ChevronRight size={16} className="text-txt2" />
              </button>
            </GlassCard>
          </motion.div>
        </StaggerGroup>
      </PullToRefresh>

      {/* Top-up Modal */}
      <TopupModal
        isOpen={topupOpen}
        onClose={() => setTopupOpen(false)}
      />

      {/* Promo Code Modal */}
      <PromoModal
        isOpen={promoOpen}
        onClose={() => setPromoOpen(false)}
      />
    </Screen>
  );
}
