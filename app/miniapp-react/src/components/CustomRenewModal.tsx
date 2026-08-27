import { useState, useEffect } from 'react';
import { Check, QrCode, Sparkles, Wallet } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { GradientButton } from './GradientButton';
import { haptic, hapticNotify, openLink, showAlert } from '../lib/telegram';
import * as api from '../api/client';
import { useAppStore } from '../store/useAppStore';

interface CustomRenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const PRESETS = [7, 14, 30, 90, 180, 365];

export function CustomRenewModal({ isOpen, onClose, onSuccess }: CustomRenewModalProps) {
  const [days, setDays] = useState(30);
  const [method, setMethod] = useState<api.PaymentMethod>('sbp');
  const [loading, setLoading] = useState(false);
  const user = useAppStore((s) => s.user);
  const subscription = useAppStore((s) => s.subscription);
  const plans = useAppStore((s) => s.plans);
  const refresh = useAppStore((s) => s.refresh);

  // Find plan daily rate or fallback
  const plan = plans.find((p) => p.uuid === subscription?.planUuid) || plans[0];
  const dailyRate = plan ? plan.price / (plan.durationDays || 30) : 5;
  const estimatedPrice = Math.max(10, Math.round(dailyRate * days));
  const userBalance = user?.balance ?? 0;
  const hasEnoughBalance = userBalance >= estimatedPrice;

  useEffect(() => {
    if (userBalance >= estimatedPrice) {
      setMethod('balance');
    } else {
      setMethod('sbp');
    }
  }, [isOpen, userBalance, estimatedPrice]);

  const handleRenew = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.renewCustom(days, method);
      if (res.completed) {
        hapticNotify('success');
        showAlert(`Подписка успешно продлена на ${days} дн.!`);
        await refresh();
        onSuccess?.();
        onClose();
      } else if (res.confirmationUrl) {
        openLink(res.confirmationUrl);
        showAlert('Перейдите к оплате. После оплаты подписка продлится автоматически.');
        onClose();
      } else if (res.needsTopup) {
        showAlert(`Недостаточно средств на балансе. Требуется ${estimatedPrice} ₽.`);
      } else {
        showAlert(res.message || 'Заказ на продление создан');
        onClose();
      }
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Ошибка продления');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Продление подписки">
      <div className="space-y-4 py-2">
        {/* Days count display */}
        <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-txt2">Срок продления</p>
          <p className="mt-1 font-mono text-3xl font-extrabold text-white tabular-nums">
            +{days} <span className="text-lg font-normal text-txt2">дней</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            ≈ {estimatedPrice} ₽
          </p>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => {
                haptic('light');
                setDays(p);
              }}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                days === p
                  ? 'border border-white/30 bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.2)] scale-[1.02]'
                  : 'border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'
              }`}
            >
              {p === 365 ? '1 год' : p === 180 ? '6 мес' : p === 90 ? '3 мес' : p === 30 ? '1 мес' : `${p} дн`}
            </button>
          ))}
        </div>

        {/* Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-txt2 font-medium">
            <span>3 дня</span>
            <span>365 дней</span>
          </div>
          <input
            type="range"
            min={3}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-white"
          />
        </div>

        {/* Payment Method Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-txt2">Способ оплаты</label>
          <div className="space-y-2">
            {/* 1. Balance */}
            <button
              onClick={() => {
                if (hasEnoughBalance) {
                  haptic('light');
                  setMethod('balance');
                } else {
                  showAlert(`Недостаточно средств на балансе (${Math.round(userBalance)} ₽ из ${estimatedPrice} ₽)`);
                }
              }}
              className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition-all ${
                method === 'balance'
                  ? 'border-white/40 bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                  : hasEnoughBalance
                    ? 'border-white/10 bg-white/[0.02] text-txt2 hover:bg-white/[0.05]'
                    : 'border-white/5 bg-white/[0.01] text-zinc-600 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-3">
                <Wallet size={20} className={method === 'balance' ? 'text-white' : hasEnoughBalance ? 'text-zinc-400' : 'text-zinc-700'} />
                <div>
                  <div className="text-sm font-semibold text-white">Оплата с баланса</div>
                  <div className="text-xs text-txt2">
                    {hasEnoughBalance
                      ? `Доступно: ${Math.round(userBalance)} ₽`
                      : `Недостаточно средств (у вас ${Math.round(userBalance)} ₽)`}
                  </div>
                </div>
              </div>
              {method === 'balance' && <Check size={18} className="text-white" />}
            </button>

            {/* 2. SBP (ЮMoney) */}
            <button
              onClick={() => {
                haptic('light');
                setMethod('sbp');
              }}
              className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition-all ${
                method === 'sbp' || method === 'card'
                  ? 'border-white/40 bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                  : 'border-white/10 bg-white/[0.02] text-txt2 hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-3">
                <QrCode size={20} className={method === 'sbp' || method === 'card' ? 'text-white' : 'text-zinc-400'} />
                <div>
                  <div className="text-sm font-semibold text-white">Оплата через СБП (ЮMoney)</div>
                  <div className="text-xs text-txt2">Банковские карты, QR СБП без комиссии</div>
                </div>
              </div>
              {(method === 'sbp' || method === 'card') && <Check size={18} className="text-white" />}
            </button>

            {/* 3. Crypto (RollyPay) */}
            <button
              onClick={() => {
                haptic('light');
                setMethod('crypto');
              }}
              className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition-all ${
                method === 'crypto'
                  ? 'border-white/40 bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                  : 'border-white/10 bg-white/[0.02] text-txt2 hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Sparkles size={20} className={method === 'crypto' ? 'text-white' : 'text-zinc-400'} />
                <div>
                  <div className="text-sm font-semibold text-white">Оплата криптой (RollyPay)</div>
                  <div className="text-xs text-txt2">USDT, TON, BTC, CryptoBot, xRocket</div>
                </div>
              </div>
              {method === 'crypto' && <Check size={18} className="text-white" />}
            </button>
          </div>
        </div>

        <GradientButton onClick={handleRenew} loading={loading}>
          {method === 'balance' && !hasEnoughBalance
            ? `Не хватает ${estimatedPrice - Math.round(userBalance)} ₽`
            : `Продлить за ${estimatedPrice} ₽`}
        </GradientButton>
      </div>
    </BottomSheet>
  );
}
