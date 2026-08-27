import { motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { GradientButton } from '../components/GradientButton';
import { GlassCard } from '../components/GlassCard';
import { Screen, ScreenHeader } from '../components/Screen';
import { EASE, formatRub } from '../lib/format';
import { applyPayment } from '../lib/payment';
import { hapticNotify, setMainButtonLoading, showAlert, useMainButton } from '../lib/telegram';
import * as api from '../api/client';
import type { PaymentMethod } from '../api/client';
import { useAppStore } from '../store/useAppStore';

const PRESETS = [100, 300, 500, 1000];
const METHODS: Array<{ id: Exclude<PaymentMethod, 'balance'>; label: string }> = [
  { id: 'card', label: 'Карта / СБП' },
  { id: 'crypto', label: 'Крипто' },
  { id: 'xrocket', label: 'xRocket' },
  { id: 'cryptobot', label: 'CryptoBot' },
];

export default function WalletScreen() {
  const user = useAppStore((s) => s.user);
  const config = useAppStore((s) => s.config);
  const refresh = useAppStore((s) => s.refresh);
  const [amount, setAmount] = useState<number>(300);
  const [custom, setCustom] = useState('');
  const [paying, setPaying] = useState(false);
  const [status, setStatus] = useState('');
  const [pendingUuid, setPendingUuid] = useState<string | null>(null);
  const [method, setMethod] = useState<Exclude<PaymentMethod, 'balance'>>('card');

  const min = config?.minTopup ?? 100;
  const max = config?.maxTopup ?? 50000;
  const effective = custom ? Math.max(0, Number(custom) || 0) : amount;

  const pay = useCallback((): void => {
    if (paying || effective < min || effective > max) {
      if (effective < min || effective > max) {
        showAlert(`Сумма должна быть от ${min} до ${max}`);
      }
      return;
    }
    setPaying(true);
    setMainButtonLoading(true);
    void api
      .topUp(effective, method)
      .then(async (result) => {
        const message = await applyPayment(result, refresh);
        setPendingUuid(result.orderUuid ?? null);
        setStatus(message);
        hapticNotify('success');
      })
      .catch((error: unknown) => {
        hapticNotify('error');
        showAlert(error instanceof Error ? error.message : 'Пополнение не удалось');
      })
      .finally(() => {
        setPaying(false);
        setMainButtonLoading(false);
      });
  }, [paying, effective, min, max, method, refresh]);

  useMainButton({
    text: `Пополнить на ${formatRub(effective)}`,
    onClick: pay,
  });

  return (
    <Screen>
      <ScreenHeader title="Пополнение" subtitle={`От ${formatRub(min)} до ${formatRub(max)}`} />

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="space-y-3"
      >
        <GlassCard className="text-center">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-txt2">
            Баланс кошелька
          </p>
          <p className="mt-1 font-mono text-[36px] font-bold tabular-nums leading-none">
            {(user?.balance ?? 0).toLocaleString('ru-RU')} ₽
          </p>
        </GlassCard>

        <GlassCard>
          <div className="mb-3 flex gap-2">
            {PRESETS.map((preset) => (
              <motion.button
                key={preset}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setAmount(preset);
                  setCustom('');
                }}
                className={`h-10 flex-1 rounded-full border font-mono text-[13px] font-semibold transition-colors ${
                  !custom && amount === preset
                    ? 'border-transparent bg-gradient-to-br from-violet-500 to-violet-400 text-white shadow-glow'
                    : 'border-white/[0.08] bg-white/[0.03] text-txt2'
                }`}
              >
                {preset}
              </motion.button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-txt2">Своя сумма</span>
            <input
              inputMode="numeric"
              type="number"
              min={min}
              max={max}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={`От ${min}`}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-mono text-[15px] text-white outline-none placeholder:text-txt2 focus:border-accent/50"
            />
          </label>
        </GlassCard>

        <GlassCard>
          <h3 className="mb-3 font-semibold">Способ оплаты</h3>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((item) => (
              <button
                key={item.id}
                onClick={() => setMethod(item.id)}
                className={`rounded-xl border px-3 py-2 text-[13px] font-semibold ${
                  method === item.id
                    ? 'border-transparent bg-gradient-to-br from-violet-500 to-violet-400 text-white'
                    : 'border-white/[0.08] bg-white/[0.03] text-txt2'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </GlassCard>

        {status ? (
          <div className="rounded-card border border-success/30 bg-success/[0.06] p-5 text-center">
            <p className="font-semibold text-success">{status}</p>
            {pendingUuid && (
              <GradientButton
                className="mt-3"
                onClick={() => {
                  void api.checkOrder(pendingUuid).then(async (result) => {
                    if (result.ok) {
                      await refresh();
                      hapticNotify('success');
                      setStatus('Баланс пополнен');
                      setPendingUuid(null);
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
            Пополнить на {formatRub(effective)}
          </GradientButton>
        )}
      </motion.div>
    </Screen>
  );
}
