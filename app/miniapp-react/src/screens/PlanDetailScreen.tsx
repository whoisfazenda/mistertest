import { motion } from 'framer-motion';
import { ArrowLeft, Check, CreditCard, Sparkles, Wallet } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { Screen } from '../components/Screen';
import { EASE, formatRub } from '../lib/format';
import { applyPayment } from '../lib/payment';
import { hapticNotify, setMainButtonLoading, showAlert, useMainButton } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';
import * as api from '../api/client';
import type { PaymentMethod } from '../api/client';

const METHODS: Array<{ id: PaymentMethod; label: string; icon: any }> = [
  { id: 'balance', label: 'Баланс', icon: Wallet },
  { id: 'card', label: 'Карта / СБП', icon: CreditCard },
  { id: 'crypto', label: 'Крипта', icon: Sparkles },
];

export default function PlanDetailScreen() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const plans = useAppStore((s) => s.plans);
  const user = useAppStore((s) => s.user);
  const refresh = useAppStore((s) => s.refresh);
  const [paying, setPaying] = useState(false);
  const [status, setStatus] = useState('');
  const [pendingUuid, setPendingUuid] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('balance');

  const plan = plans.find((p) => p.id === planId || p.uuid === planId) ?? null;
  const price = plan?.price ?? 0;
  const hasEnoughBalance = (user?.balance ?? 0) >= price;

  const pay = useCallback((): void => {
    if (!plan || paying) return;
    setPaying(true);
    setMainButtonLoading(true);
    void api
      .purchasePlan(plan.uuid, method)
      .then(async (result) => {
        const message = await applyPayment(result, refresh);
        setPendingUuid(result.orderUuid ?? null);
        setStatus(message);
        hapticNotify('success');
        if (result.completed) navigate('/');
      })
      .catch((error: unknown) => {
        hapticNotify('error');
        showAlert(error instanceof Error ? error.message : 'Оплата не удалась');
      })
      .finally(() => {
        setPaying(false);
        setMainButtonLoading(false);
      });
  }, [plan, paying, method, refresh, navigate]);

  useMainButton({
    text: `Оплатить ${formatRub(price)}`,
    onClick: pay,
  });

  if (!plan) {
    return (
      <Screen>
        <div className="space-y-4 pt-4">
          <button
            onClick={() => navigate('/pricing')}
            className="flex items-center gap-2 text-xs text-txt2"
          >
            <ArrowLeft size={16} />
            <span>Назад к тарифам</span>
          </button>
          <GlassCard className="p-8 text-center text-sm text-txt2">
            Тариф не найден
          </GlassCard>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="space-y-4 pt-2">
        <button
          onClick={() => navigate('/pricing')}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.08]"
        >
          <ArrowLeft size={16} />
          <span>Назад к тарифам</span>
        </button>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="space-y-3"
        >
          <GlassCard className="p-6 text-center space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-txt2">Тариф</span>
            <h2 className="text-2xl font-bold text-white">{plan.name}</h2>
            <p className="font-mono text-4xl font-extrabold text-white tabular-nums pt-2">
              {formatRub(price)}
            </p>
            <p className="text-xs text-txt2">на {plan.durationDays} дней · до {plan.devices} устройств</p>
          </GlassCard>

          <GlassCard className="p-5">
            <h3 className="mb-3 text-sm font-bold text-white uppercase tracking-wider">Что входит</h3>
            <ul className="space-y-2.5">
              {(plan.features || []).map((f) => (
                <li key={f} className="flex items-center gap-3 text-xs text-txt2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard className="p-5">
            <h3 className="mb-3 text-sm font-bold text-white uppercase tracking-wider">Способ оплаты</h3>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((item) => {
                const Icon = item.icon;
                const isSelected = method === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setMethod(item.id)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      isSelected
                        ? 'border-white/40 bg-white text-black font-bold shadow-md'
                        : 'border-white/10 bg-white/[0.03] text-txt2 hover:bg-white/[0.06]'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-xs">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {status ? (
            <div className="rounded-card border border-white/20 bg-white/[0.06] p-5 text-center">
              <p className="font-semibold text-white">{status}</p>
              {pendingUuid && (
                <GradientButton
                  className="mt-3"
                  onClick={() => {
                    void api.checkOrder(pendingUuid).then(async (result) => {
                      if (result.ok) {
                        await refresh();
                        hapticNotify('success');
                        navigate('/');
                      } else {
                        showAlert(result.message ?? 'Оплата ещё не подтверждена');
                      }
                    });
                  }}
                >
                  Проверить оплату
                </GradientButton>
              )}
            </div>
          ) : (
            <GradientButton onClick={pay} loading={paying}>
              {method === 'balance' && !hasEnoughBalance
                ? `Пополнить баланс (${price} ₽)`
                : `Оплатить ${formatRub(price)}`}
            </GradientButton>
          )}
        </motion.div>
      </div>
    </Screen>
  );
}
