import { motion } from 'framer-motion';
import {
  ChevronRight,
  Clock,
  Copy,
  Laptop,
  PauseCircle,
  PlayCircle,
  PlusCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard, StaggerGroup } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { HeroBanner } from '../components/HeroBanner';
import { PullToRefresh } from '../components/PullToRefresh';
import { Screen } from '../components/Screen';
import { QrModal } from '../components/QrModal';
import { DeepLinkButtons } from '../components/DeepLinkButtons';
import { CustomRenewModal } from '../components/CustomRenewModal';
import { TrafficTopupModal } from '../components/TrafficTopupModal';
import { formatDate, formatGb, staggerItem } from '../lib/format';
import { haptic, hapticNotify, showAlert } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';
import * as api from '../api/client';

export default function HomeScreen() {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const subscription = useAppStore((s) => s.subscription);
  const trial = useAppStore((s) => s.trial);
  const refresh = useAppStore((s) => s.refresh);

  const [qrOpen, setQrOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [trafficOpen, setTrafficOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false);

  const hasSub = Boolean(subscription && (subscription.isActive || subscription.isFrozen || subscription.daysLeft != null));
  const isExpired = Boolean(subscription?.isExpired);
  const isFrozen = Boolean(subscription?.isFrozen);
  const days = subscription?.daysLeft ?? 0;
  const ringMax = Math.max(days, 30);
  const progress = isExpired ? 0 : Math.min(days / ringMax, 1);
  const circumference = 2 * Math.PI * 50;
  const dash = circumference * progress;

  const copyUrl = async () => {
    const url = subscription?.subscriptionUrl || subscription?.publicUrl;
    if (!url) {
      showAlert('Ссылка подписки пока недоступна');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      hapticNotify('success');
      showAlert('✅ Ссылка подписки скопирована в буфер обмена');
    } catch {
      prompt('Скопируйте ссылку:', url);
    }
  };

  const handleClaimTrial = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      await api.claimTrial();
      await refresh();
      hapticNotify('success');
      showAlert('🎉 Пробный период на 7 дней успешно активирован!');
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Не удалось активировать пробный период');
    } finally {
      setClaiming(false);
    }
  };

  const handleToggleFreeze = async () => {
    if (freezing || !subscription) return;
    setFreezing(true);
    try {
      const nextState = !isFrozen;
      await api.freezeSubscription(nextState);
      await refresh();
      hapticNotify('success');
      showAlert(nextState ? '❄️ Подписка заморожена' : '▶️ Подписка разморожена');
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Ошибка изменения статуса заморозки');
    } finally {
      setFreezing(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    if (togglingAutoRenew || !subscription) return;
    setTogglingAutoRenew(true);
    try {
      const next = !subscription.autoRenewEnabled;
      await api.toggleAutoRenew(next);
      await refresh();
      hapticNotify('success');
      showAlert(next ? '✅ Автопродление включено' : '❌ Автопродление выключено');
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Ошибка изменения автопродления');
    } finally {
      setTogglingAutoRenew(false);
    }
  };

  return (
    <Screen>
      <PullToRefresh onRefresh={refresh}>
        <StaggerGroup className="space-y-4 pt-1">
          {/* Main Hero Card */}
          <motion.div variants={staggerItem}>
            <HeroBanner
              imageName={hasSub ? 'subscriptions.png' : 'main.png'}
              badge={
                hasSub
                  ? isFrozen
                    ? 'Заморожена'
                    : isExpired
                    ? 'Истекла'
                    : 'Защита активна'
                  : 'Mister VPN'
              }
              title={
                hasSub
                  ? isFrozen
                    ? 'VPN на паузе'
                    : isExpired
                    ? 'Подписка истекла'
                    : 'Ваш VPN защищён'
                  : 'Свободный и быстрый интернет'
              }
              subtitle={
                hasSub
                  ? subscription?.planName || 'Персональный VPN'
                  : 'Максимальная скорость, шифрование VLESS и обход блокировок'
              }
            />
          </motion.div>

          {/* ACTIVE SUBSCRIPTION VIEW */}
          {hasSub && subscription && (
            <>
              {/* Gauge & Key Stats */}
              <motion.div variants={staggerItem}>
                <GlassCard className="flex items-center justify-between gap-4 p-5">
                  <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
                    <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth="7"
                      />
                      <motion.circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke={isExpired || isFrozen ? '#71717a' : '#ffffff'}
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${circumference}`}
                        initial={{ strokeDasharray: `0 ${circumference}` }}
                        animate={{ strokeDasharray: `${dash} ${circumference}` }}
                        transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className="font-mono text-2xl font-extrabold text-white tabular-nums">
                        {isExpired ? 0 : days}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-txt2">
                        дней
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 space-y-2 text-xs text-txt2">
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-1.5">
                      <span>Действует до:</span>
                      <span className="font-medium text-white">
                        {formatDate(subscription.renewsAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-1.5">
                      <span>Устройства:</span>
                      <span className="font-medium text-white">
                        {subscription.devicesUsed} / {subscription.devicesMax || '∞'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Трафик:</span>
                      <span className="font-medium text-white">
                        {subscription.trafficLimitGb > 0
                          ? `${formatGb(subscription.trafficUsedGb)} / ${formatGb(subscription.trafficLimitGb)}`
                          : `${formatGb(subscription.trafficUsedGb)} / ∞`}
                      </span>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>

              {/* Quick Actions: Copy Link & Show QR */}
              <motion.div variants={staggerItem}>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={copyUrl}
                    className="flex h-12 items-center justify-center gap-2 rounded-btn border border-white/15 bg-white/[0.05] font-semibold text-white transition-all hover:bg-white/[0.1] active:scale-[0.98]"
                  >
                    <Copy size={16} />
                    <span className="text-sm">Скопировать ключ</span>
                  </button>

                  <button
                    onClick={() => setQrOpen(true)}
                    className="flex h-12 items-center justify-center gap-2 rounded-btn border border-white/15 bg-white text-black font-semibold shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all hover:bg-zinc-200 active:scale-[0.98]"
                  >
                    <QrCode size={16} />
                    <span className="text-sm">Показать QR</span>
                  </button>
                </div>
              </motion.div>

              {/* 1-Click Deep Links into Happ, Incy, Karing, V2RayTun */}
              <motion.div variants={staggerItem}>
                <GlassCard className="p-4">
                  <DeepLinkButtons
                    subscriptionUrl={
                      subscription.subscriptionUrl || subscription.publicUrl || ''
                    }
                  />
                </GlassCard>
              </motion.div>

              {/* Subscription Controls Grid */}
              <motion.div variants={staggerItem}>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setRenewOpen(true)}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center transition-all hover:bg-white/[0.08] active:scale-[0.97]"
                  >
                    <Clock size={20} className="text-white" />
                    <span className="text-xs font-semibold text-white">Продлить</span>
                  </button>

                  <button
                    onClick={() => setTrafficOpen(true)}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center transition-all hover:bg-white/[0.08] active:scale-[0.97]"
                  >
                    <PlusCircle size={20} className="text-white" />
                    <span className="text-xs font-semibold text-white">+Трафик</span>
                  </button>

                  <button
                    onClick={() => navigate('/pricing')}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center transition-all hover:bg-white/[0.08] active:scale-[0.97]"
                  >
                    <RefreshCw size={20} className="text-white" />
                    <span className="text-xs font-semibold text-white">Сменить</span>
                  </button>
                </div>
              </motion.div>

              {/* Subscription Toggles */}
              <motion.div variants={staggerItem}>
                <GlassCard className="space-y-3 p-4">
                  {/* Freeze / Unfreeze toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isFrozen ? (
                        <PlayCircle size={20} className="text-white" />
                      ) : (
                        <PauseCircle size={20} className="text-zinc-400" />
                      )}
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {isFrozen ? 'Разморозить подписку' : 'Заморозка подписки'}
                        </div>
                        <div className="text-[11px] text-txt2">
                          {isFrozen
                            ? 'Возобновить отсчёт дней'
                            : 'Останавливает списание дней'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleToggleFreeze}
                      disabled={freezing}
                      className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                        isFrozen
                          ? 'border border-white/30 bg-white text-black'
                          : 'border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.12]'
                      }`}
                    >
                      {freezing ? '...' : isFrozen ? 'Разморозить' : 'Заморозить'}
                    </button>
                  </div>

                  <div className="h-px bg-white/[0.06]" />

                  {/* Auto-renew toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <RefreshCw
                        size={20}
                        className={
                          subscription.autoRenewEnabled
                            ? 'text-white'
                            : 'text-zinc-400'
                        }
                      />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Автопродление с баланса
                        </div>
                        <div className="text-[11px] text-txt2">
                          Продлевать за 24 ч при наличии средств
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleToggleAutoRenew}
                      disabled={togglingAutoRenew}
                      className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                        subscription.autoRenewEnabled
                          ? 'border border-white/30 bg-white text-black'
                          : 'border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.12]'
                      }`}
                    >
                      {togglingAutoRenew
                        ? '...'
                        : subscription.autoRenewEnabled
                        ? 'Включено'
                        : 'Выключено'}
                    </button>
                  </div>
                </GlassCard>
              </motion.div>
            </>
          )}

          {/* NO SUBSCRIPTION VIEW */}
          {!hasSub && (
            <>
              {/* Free Trial Banner */}
              {trial && !user?.trialClaimed && (
                <motion.div variants={staggerItem}>
                  <GlassCard className="relative overflow-hidden border-white/20 bg-gradient-to-r from-white/[0.08] to-white/[0.02] p-5 shadow-[0_0_30px_rgba(255,255,255,0.06)]">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white">
                        <Sparkles size={24} />
                      </div>
                      <div className="flex-1">
                        <span className="inline-flex rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                          Бесплатно
                        </span>
                        <h3 className="mt-1 font-bold text-white text-base">
                          {trial.name || 'Пробный период на 7 дней'}
                        </h3>
                        <p className="text-xs text-txt2">
                          Оцените полную скорость без оплаты и ввода карт
                        </p>
                      </div>
                    </div>
                    <GradientButton
                      className="mt-4 !h-11 text-sm font-bold"
                      loading={claiming}
                      onClick={handleClaimTrial}
                    >
                      Попробовать 7 дней бесплатно
                    </GradientButton>
                  </GlassCard>
                </motion.div>
              )}

              {/* Benefits list */}
              <motion.div variants={staggerItem}>
                <div className="space-y-2.5">
                  <GlassCard className="flex items-center gap-3.5 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white">
                      <Zap size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Максимальная скорость
                      </h4>
                      <p className="text-xs text-txt2">
                        VLESS Reality протокол без просадок и задержек
                      </p>
                    </div>
                  </GlassCard>

                  <GlassCard className="flex items-center gap-3.5 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Полная анонимность
                      </h4>
                      <p className="text-xs text-txt2">
                        Шифрование данных и отсутствие логов активности
                      </p>
                    </div>
                  </GlassCard>

                  <GlassCard className="flex items-center gap-3.5 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white">
                      <Laptop size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Все ваши устройства
                      </h4>
                      <p className="text-xs text-txt2">
                        iOS, Android, Windows, macOS и роутеры
                      </p>
                    </div>
                  </GlassCard>
                </div>
              </motion.div>

              {/* Choose Plan CTA */}
              <motion.div variants={staggerItem}>
                <GradientButton
                  onClick={() => {
                    haptic('medium');
                    navigate('/pricing');
                  }}
                >
                  Выбрать тариф
                  <ChevronRight size={18} />
                </GradientButton>
              </motion.div>
            </>
          )}
        </StaggerGroup>
      </PullToRefresh>

      {/* Modals */}
      <QrModal
        isOpen={qrOpen}
        onClose={() => setQrOpen(false)}
        url={subscription?.subscriptionUrl || subscription?.publicUrl || ''}
      />

      <CustomRenewModal
        isOpen={renewOpen}
        onClose={() => setRenewOpen(false)}
        onSuccess={() => void refresh()}
      />

      <TrafficTopupModal
        isOpen={trafficOpen}
        onClose={() => setTrafficOpen(false)}
      />
    </Screen>
  );
}
