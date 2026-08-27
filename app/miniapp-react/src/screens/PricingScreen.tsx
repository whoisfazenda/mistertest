import { motion } from 'framer-motion';
import {
  Check,
  ChevronRight,
  Gift,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { GlassCard, StaggerGroup } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { HeroBanner } from '../components/HeroBanner';
import { PullToRefresh } from '../components/PullToRefresh';
import { Screen } from '../components/Screen';
import { CheckoutModal } from '../components/CheckoutModal';
import { staggerItem } from '../lib/format';
import { haptic, hapticNotify, showAlert } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';
import type { Plan } from '../types';
import * as api from '../api/client';

export default function PricingScreen() {
  const plans = useAppStore((s) => s.plans);
  const trial = useAppStore((s) => s.trial);
  const user = useAppStore((s) => s.user);
  const refresh = useAppStore((s) => s.refresh);

  const [periodFilter, setPeriodFilter] = useState<'all' | '1m' | '3m' | '6m' | '12m'>('all');
  const [isGiftMode, setIsGiftMode] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [claimingTrial, setClaimingTrial] = useState(false);

  const handleClaimTrial = async () => {
    if (claimingTrial) return;
    setClaimingTrial(true);
    try {
      await api.claimTrial();
      await refresh();
      hapticNotify('success');
      showAlert('🎉 Пробный период на 7 дней успешно активирован!');
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Не удалось активировать пробный период');
    } finally {
      setClaimingTrial(false);
    }
  };

  const handleSelectPlan = (plan: Plan) => {
    haptic('medium');
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      // Filter trial plans out of regular store list
      if (p.isTrial) return false;

      // Period filter
      if (periodFilter === '1m' && p.durationDays > 45) return false;
      if (periodFilter === '3m' && (p.durationDays < 46 || p.durationDays > 120)) return false;
      if (periodFilter === '6m' && (p.durationDays < 121 || p.durationDays > 240)) return false;
      if (periodFilter === '12m' && p.durationDays < 241) return false;

      return true;
    });
  }, [plans, periodFilter]);

  return (
    <Screen>
      <PullToRefresh onRefresh={refresh}>
        <StaggerGroup className="space-y-4 pt-1">
          {/* Hero Banner */}
          <motion.div variants={staggerItem}>
            <HeroBanner
              imageName="buy.png"
              badge="Магазин тарифов"
              title="Выберите тариф Mister VPN"
              subtitle="Стабильный и быстрый VLESS протокол без ограничений"
            />
          </motion.div>

          {/* Mode Switcher: For Myself vs Gift to Friend */}
          <motion.div variants={staggerItem}>
            <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              <button
                onClick={() => {
                  haptic('light');
                  setIsGiftMode(false);
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all ${
                  !isGiftMode
                    ? 'border border-white/20 bg-white text-black shadow-md'
                    : 'text-txt2 hover:text-white'
                }`}
              >
                <Zap size={14} />
                <span>Для себя</span>
              </button>

              <button
                onClick={() => {
                  haptic('light');
                  setIsGiftMode(true);
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all ${
                  isGiftMode
                    ? 'border border-white/20 bg-white text-black shadow-md'
                    : 'text-txt2 hover:text-white'
                }`}
              >
                <Gift size={14} />
                <span>В подарок другу</span>
              </button>
            </div>
          </motion.div>

          {/* Free 7-Day Trial Banner (if not claimed) */}
          {trial && !user?.trialClaimed && !isGiftMode && (
            <motion.div variants={staggerItem}>
              <GlassCard className="relative overflow-hidden border-white/20 bg-white/[0.04] p-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white">
                    <Sparkles size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm truncate">
                        {trial.name || 'Бесплатный тест на 7 дней'}
                      </span>
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                        0 ₽
                      </span>
                    </div>
                    <p className="text-[11px] text-txt2 mt-0.5">
                      Доступ ко всем локациям и устройствам без оплаты
                    </p>
                  </div>
                </div>
                <GradientButton
                  className="mt-3 !h-10 text-xs font-bold"
                  loading={claimingTrial}
                  onClick={handleClaimTrial}
                >
                  Активировать 7 дней бесплатно
                </GradientButton>
              </GlassCard>
            </motion.div>
          )}

          {/* Period Filter Tabs */}
          <motion.div variants={staggerItem}>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[
                { key: 'all', label: 'Все' },
                { key: '1m', label: '14 дн. / 1 мес' },
                { key: '3m', label: '3 месяца' },
                { key: '6m', label: '6 месяцев' },
                { key: '12m', label: '1 год' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    haptic('light');
                    setPeriodFilter(tab.key as any);
                  }}
                  className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    periodFilter === tab.key
                      ? 'border border-white/30 bg-white text-black shadow-sm'
                      : 'border border-white/10 bg-white/[0.03] text-txt2 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Plan Cards List */}
          {filteredPlans.length > 0 ? (
            filteredPlans.map((plan) => {
              const monthlyRate =
                plan.durationDays > 0
                  ? Math.round(plan.price / (plan.durationDays / 30))
                  : plan.price;

              return (
                <motion.div key={plan.uuid || plan.id} variants={staggerItem}>
                  <GlassCard
                    interactive
                    onClick={() => handleSelectPlan(plan)}
                    className={`relative overflow-hidden p-5 ${
                      plan.popular ? 'border-white/30 bg-white/[0.05]' : ''
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute right-0 top-0 rounded-bl-xl border-l border-b border-white/20 bg-white px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-black">
                        Хит продаж
                      </span>
                    )}

                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                        <p className="text-xs text-txt2 mt-0.5 flex items-center gap-2">
                          <span>{plan.durationDays} дн.</span>
                          <span>•</span>
                          <span>До {plan.devices} устройств</span>
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="font-mono text-2xl font-extrabold text-white tabular-nums">
                          {plan.price} ₽
                        </div>
                        {plan.durationDays > 45 && (
                          <div className="text-[11px] font-medium text-txt2">
                            {monthlyRate} ₽/мес
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Features list */}
                    <div className="mt-3.5 space-y-1.5 border-t border-white/[0.06] pt-3">
                      <div className="flex items-center gap-2 text-xs text-txt2">
                        <Check size={14} className="text-white shrink-0" />
                        <span>До {plan.devices} одновременных устройств</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-txt2">
                        <Check size={14} className="text-white shrink-0" />
                        <span>
                          {plan.trafficLimitBytes && plan.trafficLimitBytes > 0
                            ? `${(plan.trafficLimitBytes / 1e9).toFixed(0)} ГБ трафика`
                            : 'Безлимитный скоростной трафик'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-txt2">
                        <Check size={14} className="text-white shrink-0" />
                        <span>Протоколы VLESS, Reality, XTLS</span>
                      </div>
                    </div>

                    {/* CTA Button */}
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <GradientButton
                        className="!h-11 text-xs font-bold"
                        onClick={() => handleSelectPlan(plan)}
                      >
                        {isGiftMode ? 'Подарить другу' : 'Оформить тариф'}
                        <ChevronRight size={16} />
                      </GradientButton>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })
          ) : (
            <motion.div variants={staggerItem}>
              <GlassCard className="p-8 text-center">
                <p className="text-sm font-semibold text-white">Тарифы не найдены</p>
                <p className="text-xs text-txt2 mt-1">
                  Попробуйте изменить фильтры периода
                </p>
              </GlassCard>
            </motion.div>
          )}
        </StaggerGroup>
      </PullToRefresh>

      {/* Smart Checkout Bottom Sheet */}
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        plan={selectedPlan}
        isGift={isGiftMode}
        onSuccess={() => void refresh()}
      />
    </Screen>
  );
}
