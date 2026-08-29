import { motion } from 'framer-motion';
import { CalendarClock, Copy, Infinity as InfinityIcon, Laptop } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CountUp } from '../components/Controls';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { Screen, ScreenHeader } from '../components/Screen';
import { EASE, formatDate, formatGb } from '../lib/format';
import { applyPayment } from '../lib/payment';
import { hapticNotify, openLink, showAlert } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';
import * as api from '../api/client';

export default function SubscriptionScreen() {
  const navigate = useNavigate();
  const subscription = useAppStore((s) => s.subscription);
  const refresh = useAppStore((s) => s.refresh);
  const [busy, setBusy] = useState(false);

  if (!subscription) {
    return (
      <Screen>
        <ScreenHeader title="Моя подписка" />
        <GlassCard className="text-center">
          <p className="text-txt2">Подписки пока нет</p>
          <GradientButton className="mt-4" onClick={() => navigate('/pricing')}>
            Выбрать тариф
          </GradientButton>
        </GlassCard>
      </Screen>
    );
  }

  const unlimited = !(subscription.trafficLimitGb > 0);
  const usedPct = unlimited
    ? 0
    : Math.min(Math.round((subscription.trafficUsedGb / subscription.trafficLimitGb) * 100), 100);

  const freeze = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.freezeSubscription(!subscription.isFrozen);
      await refresh();
      hapticNotify('success');
    } catch (error) {
      hapticNotify('error');
      showAlert(error instanceof Error ? error.message : 'Не удалось изменить заморозку');
    } finally {
      setBusy(false);
    }
  };

  const renew = async (): Promise<void> => {
    if (subscription.isTrial) {
      navigate('/pricing');
      return;
    }
    setBusy(true);
    try {
      const result = await api.renewSubscription('card');
      const message = await applyPayment(result, refresh);
      hapticNotify('success');
      showAlert(message);
    } catch (error) {
      hapticNotify('error');
      showAlert(error instanceof Error ? error.message : 'Не удалось продлить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Моя подписка" subtitle={subscription.planName} />

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="space-y-3"
      >
        <GlassCard className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-violet-500 opacity-15 blur-3xl" />
          <h1 className="text-[28px] font-bold">{subscription.planName}</h1>
          <p className="mt-1 text-[13px] text-txt2">
            {subscription.isFrozen
              ? 'Заморожена'
              : subscription.isExpired
                ? 'Истекла'
                : subscription.isTrial
                  ? 'Пробный период'
                  : 'Активна'}
          </p>
          <div className="mt-4 space-y-3">
            <InfoRow
              icon={<CalendarClock size={18} strokeWidth={1.5} />}
              label="Действует до"
              value={formatDate(subscription.renewsAt)}
            />
            <InfoRow
              icon={<Laptop size={18} strokeWidth={1.5} />}
              label="Устройства"
              value={`${subscription.devicesUsed} / ${subscription.devicesMax || '∞'}`}
            />
            <InfoRow
              icon={<InfinityIcon size={18} strokeWidth={1.5} />}
              label="Трафик"
              value={
                unlimited
                  ? 'Безлимит'
                  : `Осталось ${formatGb(Math.max(0, subscription.trafficLimitGb - subscription.trafficUsedGb))} из ${formatGb(subscription.trafficLimitGb)}`
              }
            />
          </div>

          {!unlimited && (
            <div className="mt-5">
              <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${usedPct}%` }}
                  transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400"
                />
              </div>
              <p className="mt-1.5 text-right text-[12px] font-semibold text-txt2">
                <CountUp value={usedPct} render={(n) => `${Math.round(n)}%`} /> использовано
              </p>
            </div>
          )}
        </GlassCard>

        {subscription.subscriptionUrl && (
          <>
            <GradientButton onClick={() => openLink(subscription.subscriptionUrl!)}>
              Открыть VPN-подписку
            </GradientButton>
            <GradientButton
              onClick={() => {
                void navigator.clipboard.writeText(subscription.subscriptionUrl!).then(
                  () => {
                    hapticNotify('success');
                    showAlert('Ссылка скопирована');
                  },
                  () => showAlert(subscription.subscriptionUrl!),
                );
              }}
            >
              <Copy size={16} strokeWidth={1.5} />
              Скопировать ссылку
            </GradientButton>
          </>
        )}
        <GradientButton loading={busy} onClick={() => void freeze()}>
          {subscription.isFrozen ? 'Разморозить' : 'Заморозить'}
        </GradientButton>
        <GradientButton loading={busy} onClick={() => void renew()}>
          {subscription.isTrial ? 'Выбрать основной тариф' : 'Продлить текущий тариф'}
        </GradientButton>
      </motion.div>
    </Screen>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.04] text-txt2">
        {icon}
      </span>
      <span className="flex-1 text-[15px] text-txt2">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
