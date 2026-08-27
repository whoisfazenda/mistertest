import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { GradientButton } from './GradientButton';
import { hapticNotify, openLink, showAlert } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';
import type { PaymentMethod } from '../api/client';

interface TrafficTopupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GB_PRESETS = [10, 25, 50, 100];

export function TrafficTopupModal({ isOpen, onClose }: TrafficTopupModalProps) {
  const [gb, setGb] = useState(25);
  const [method, setMethod] = useState<PaymentMethod>('balance');
  const [loading, setLoading] = useState(false);
  const user = useAppStore((s) => s.user);
  const config = useAppStore((s) => s.config);
  const refresh = useAppStore((s) => s.refresh);

  const pricePerGb = config?.trafficPricePerGb ?? 3;
  const totalPrice = gb * pricePerGb;
  const hasEnoughBalance = (user?.balance ?? 0) >= totalPrice;

  const handleBuyTraffic = async () => {
    if (loading) return;
    setLoading(true);
    try {
      // Create request for traffic purchase
      const res = await fetch('/miniapp/api/orders/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': (window as any).Telegram?.WebApp?.initData || '',
        },
        body: JSON.stringify({ amount: totalPrice, payment_method: method, extra: { gb_amount: gb } }),
      });
      const data = await res.json();
      if (data.completed || data.ok) {
        hapticNotify('success');
        showAlert(`Добавлено +${gb} ГБ трафика!`);
        await refresh();
        onClose();
      } else if (data.confirmation_url) {
        openLink(data.confirmation_url);
        showAlert('Перейдите к оплате для начисления трафика');
        onClose();
      } else {
        showAlert(data.message || 'Заказ создан');
        onClose();
      }
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Не удалось докупить трафик');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Докупка трафика">
      <div className="space-y-5 py-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-txt2">Дополнительный трафик</p>
          <p className="mt-1 font-mono text-3xl font-bold text-white tabular-nums">
            +{gb} <span className="text-lg font-normal text-txt2">ГБ</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {totalPrice} ₽ ({pricePerGb} ₽ / ГБ)
          </p>
        </div>

        {/* Preset buttons */}
        <div className="grid grid-cols-4 gap-2">
          {GB_PRESETS.map((amount) => (
            <button
              key={amount}
              onClick={() => setGb(amount)}
              className={`rounded-xl py-2.5 text-center font-mono text-sm font-bold transition-all ${
                gb === amount
                  ? 'border border-white/30 bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                  : 'border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'
              }`}
            >
              +{amount} ГБ
            </button>
          ))}
        </div>

        {/* Method Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-txt2">Способ оплаты</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMethod('balance')}
              className={`rounded-xl border p-3 text-left transition-all ${
                method === 'balance'
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.03] text-txt2'
              }`}
            >
              <div className="text-xs font-semibold text-white">Баланс бота</div>
              <div className="text-[11px] text-txt2">
                {Math.round(user?.balance ?? 0)} ₽
              </div>
            </button>

            <button
              onClick={() => setMethod('card')}
              className={`rounded-xl border p-3 text-left transition-all ${
                method === 'card'
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.03] text-txt2'
              }`}
            >
              <div className="text-xs font-semibold text-white">Карта / СБП</div>
              <div className="text-[11px] text-txt2">Через шлюз</div>
            </button>
          </div>
        </div>

        <GradientButton onClick={handleBuyTraffic} loading={loading}>
          {method === 'balance' && !hasEnoughBalance
            ? `Не хватает ${totalPrice - (user?.balance ?? 0)} ₽`
            : `Купить +${gb} ГБ за ${totalPrice} ₽`}
        </GradientButton>
      </div>
    </BottomSheet>
  );
}
