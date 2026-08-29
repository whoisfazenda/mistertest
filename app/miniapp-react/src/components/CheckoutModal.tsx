import { Check, ExternalLink, Gift, Loader2, QrCode, Sparkles, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { GradientButton } from './GradientButton';
import { haptic, hapticNotify, openLink, showAlert } from '../lib/telegram';
import * as api from '../api/client';
import type { PaymentMethod } from '../api/client';
import type { Plan } from '../types';
import { useAppStore } from '../store/useAppStore';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan | null;
  isGift?: boolean;
  initialRecipient?: string;
  onSuccess?: () => void;
}

export function CheckoutModal({
  isOpen,
  onClose,
  plan,
  isGift = false,
  initialRecipient = '',
  onSuccess,
}: CheckoutModalProps) {
  const [giftMode, setGiftMode] = useState(isGift);
  const [recipient, setRecipient] = useState(initialRecipient);
  const [method, setMethod] = useState<PaymentMethod>('sbp');
  const [loading, setLoading] = useState(false);
  const [activeOrderUuid, setActiveOrderUuid] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [waitingPayment, setWaitingPayment] = useState(false);

  const user = useAppStore((s) => s.user);
  const refresh = useAppStore((s) => s.refresh);

  useEffect(() => {
    setGiftMode(isGift);
    setRecipient(initialRecipient);
    setWaitingPayment(false);
    setActiveOrderUuid(null);
    setPayUrl(null);
    if ((user?.balance ?? 0) >= (plan?.price ?? 0)) {
      setMethod('balance');
    } else {
      setMethod('sbp');
    }
  }, [isOpen, isGift, initialRecipient, plan, user?.balance]);

  // Automated polling when waiting for external gateway payment
  useEffect(() => {
    if (!waitingPayment || !activeOrderUuid) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await api.checkOrder(activeOrderUuid);
        if (res.completed && !cancelled) {
          setWaitingPayment(false);
          hapticNotify('success');
          showAlert('🎉 Оплата успешно получена! Подписка активирована.');
          await refresh();
          onSuccess?.();
          onClose();
        }
      } catch {
        // continue polling
      }
    };

    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [waitingPayment, activeOrderUuid, refresh, onSuccess, onClose]);

  if (!plan) return null;

  const price = plan.price;
  const userBalance = user?.balance ?? 0;
  const hasEnoughBalance = userBalance >= price;

  const handleCheckout = async () => {
    if (loading) return;

    if (giftMode && !recipient.trim()) {
      showAlert('Укажите @username или Telegram ID получателя подарка');
      return;
    }

    if (method === 'balance' && !hasEnoughBalance) {
      showAlert(`Недостаточно средств на балансе. Требуется ${price} ₽ (у вас ${Math.round(userBalance)} ₽). Выберите оплату через СБП.`);
      setMethod('sbp');
      return;
    }

    setLoading(true);
    try {
      let res: api.PaymentResult;
      if (giftMode) {
        res = await api.purchaseGift(plan.uuid, recipient.trim(), method);
      } else {
        res = await api.purchasePlan(plan.uuid, method);
      }

      if (res.completed) {
        hapticNotify('success');
        showAlert(
          giftMode
            ? `🎁 Подписка успешно подарена пользователю ${recipient}!`
            : '🎉 Подписка успешно оформлена и активирована!',
        );
        await refresh();
        onSuccess?.();
        onClose();
      } else if (res.confirmationUrl) {
        setActiveOrderUuid(res.orderUuid || null);
        setPayUrl(res.confirmationUrl);
        setWaitingPayment(true);
        openLink(res.confirmationUrl);
        hapticNotify('success');
      } else if (res.needsTopup) {
        showAlert(`Недостаточно средств на балансе. Требуется ${price} ₽.`);
      } else {
        showAlert(res.message || 'Заказ оформлен');
        onClose();
      }
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Ошибка оформления заказа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={giftMode ? 'Оформление подарка' : 'Оформление заказа'}>
      <div className="space-y-4 py-2">
        {/* Order Summary Card */}
        <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-txt2">
                Тарифный план
              </span>
              <h4 className="text-lg font-extrabold text-white tracking-tight">{plan.name}</h4>
              <p className="text-xs text-txt2 mt-0.5">
                {plan.durationDays} дней · до {plan.devices} устройств
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-txt2">Итого</span>
              <p className="font-mono text-2xl font-bold text-white tabular-nums">{price} ₽</p>
            </div>
          </div>
        </div>

        {/* Gift recipient input */}
        {giftMode ? (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-txt2">
              Получатель подарка
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="@username или Telegram ID"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white placeholder-zinc-600 focus:border-white/30 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-txt2">
              Бот автоматически активирует подписку для этого пользователя
            </p>
          </div>
        ) : (
          <button
            onClick={() => setGiftMode(true)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.05]"
          >
            <div className="flex items-center gap-2.5">
              <Gift size={18} className="text-zinc-400" />
              <div>
                <div className="text-xs font-semibold text-white">Купить в подарок другу</div>
                <div className="text-[11px] text-txt2">Подарить подписку по @username</div>
              </div>
            </div>
            <Sparkles size={14} className="text-zinc-500" />
          </button>
        )}

        {/* Payment Methods */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-txt2">
            Способ оплаты
          </label>

          <div className="space-y-2">
            {/* 1. Balance */}
            <button
              onClick={() => {
                if (hasEnoughBalance) {
                  haptic('light');
                  setMethod('balance');
                } else {
                  showAlert(`Недостаточно средств на балансе (${Math.round(userBalance)} ₽ из ${price} ₽)`);
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

            {/* 2. SBP (RollyPay) */}
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
                  <div className="text-sm font-semibold text-white">Оплата через СБП / Картой РФ</div>
                  <div className="text-xs text-txt2">QR-код СБП, Банковские карты МИР, Сбер, Т-Банк</div>
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

        {/* Polling State & Link Button */}
        {waitingPayment && payUrl && (
          <div className="space-y-2.5 rounded-2xl border border-white/20 bg-white/[0.05] p-4 text-center">
            <div className="flex items-center justify-center gap-2.5">
              <Loader2 size={18} className="animate-spin text-white" />
              <span className="text-xs font-semibold text-white">
                Ожидаем подтверждения оплаты...
              </span>
            </div>
            <button
              onClick={() => openLink(payUrl)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white py-2.5 text-xs font-bold text-black shadow-md hover:bg-zinc-200"
            >
              <span>Открыть страницу оплаты</span>
              <ExternalLink size={14} />
            </button>
          </div>
        )}

        {!waitingPayment && (
          <GradientButton onClick={handleCheckout} loading={loading}>
            {method === 'balance' && !hasEnoughBalance
              ? `Не хватает ${price - Math.round(userBalance)} ₽ на балансе`
              : `Оплатить ${price} ₽`}
          </GradientButton>
        )}
      </div>
    </BottomSheet>
  );
}
