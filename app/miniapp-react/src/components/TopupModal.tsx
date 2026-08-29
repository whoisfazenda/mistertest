import { ExternalLink, Loader2, QrCode, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { GradientButton } from './GradientButton';
import { haptic, hapticNotify, openLink, showAlert } from '../lib/telegram';
import * as api from '../api/client';
import { useAppStore } from '../store/useAppStore';

interface TopupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOPUP_PRESETS = [250, 500, 1000, 2500, 5000];

export function TopupModal({ isOpen, onClose }: TopupModalProps) {
  const [amount, setAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>('500');
  const [method, setMethod] = useState<'sbp' | 'crypto' | 'card'>('sbp');
  const [loading, setLoading] = useState(false);
  const [activeOrderUuid, setActiveOrderUuid] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [waitingPayment, setWaitingPayment] = useState(false);

  const config = useAppStore((s) => s.config);
  const refresh = useAppStore((s) => s.refresh);

  const minTopup = config?.minTopup ?? 100;
  const maxTopup = config?.maxTopup ?? 50000;

  useEffect(() => {
    setWaitingPayment(false);
    setActiveOrderUuid(null);
    setPayUrl(null);
  }, [isOpen]);

  // Polling for top-up order completion
  useEffect(() => {
    if (!waitingPayment || !activeOrderUuid) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await api.checkOrder(activeOrderUuid);
        if (res.completed && !cancelled) {
          setWaitingPayment(false);
          hapticNotify('success');
          showAlert('🎉 Баланс успешно пополнен!');
          await refresh();
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
  }, [waitingPayment, activeOrderUuid, refresh, onClose]);

  const handleSelectPreset = (val: number) => {
    haptic('light');
    setAmount(val);
    setCustomAmount(String(val));
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setCustomAmount(raw);
    const num = Number(raw);
    if (num) setAmount(num);
  };

  const handleTopup = async () => {
    const num = Number(customAmount);
    if (!num || num < minTopup || num > maxTopup) {
      showAlert(`Сумма пополнения должна быть от ${minTopup} до ${maxTopup} ₽`);
      return;
    }

    setLoading(true);
    try {
      const res = await api.topUp(num, method);
      if (res.confirmationUrl) {
        setActiveOrderUuid(res.orderUuid || null);
        setPayUrl(res.confirmationUrl);
        setWaitingPayment(true);
        openLink(res.confirmationUrl);
        hapticNotify('success');
      } else {
        showAlert(res.message || 'Счёт на пополнение создан');
        onClose();
      }
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Не удалось создать платёж');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Пополнение баланса">
      <div className="space-y-4 py-2">
        {/* Amount input */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-txt2">
            Сумма пополнения (₽)
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={customAmount}
              onChange={handleCustomChange}
              placeholder={`${minTopup}`}
              className="w-full rounded-2xl border border-white/15 bg-white/[0.04] p-4 font-mono text-2xl font-extrabold text-white placeholder-zinc-600 focus:border-white/40 focus:outline-none"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xl font-bold text-zinc-500">
              ₽
            </span>
          </div>
          <p className="text-[11px] text-txt2">
            Минимум {minTopup} ₽ · Максимум {maxTopup} ₽
          </p>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {TOPUP_PRESETS.map((val) => (
            <button
              key={val}
              onClick={() => handleSelectPreset(val)}
              className={`flex-1 min-w-[65px] rounded-xl py-2.5 text-center font-mono text-sm font-bold transition-all ${
                amount === val
                  ? 'border border-white/40 bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.2)] scale-[1.02]'
                  : 'border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'
              }`}
            >
              {val} ₽
            </button>
          ))}
        </div>

        {/* Methods */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-txt2">
            Способ оплаты
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                haptic('light');
                setMethod('sbp');
              }}
              className={`flex flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition-all ${
                method === 'sbp' || method === 'card'
                  ? 'border-white/40 bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                  : 'border-white/10 bg-white/[0.03] text-txt2 hover:bg-white/[0.06]'
              }`}
            >
              <QrCode size={20} className={method === 'sbp' || method === 'card' ? 'text-white' : 'text-zinc-500'} />
              <div>
                <div className="text-xs font-bold text-white">СБП / Карты РФ</div>
                <div className="text-[10.5px] text-txt2">QR СБП, Карты МИР</div>
              </div>
            </button>

            <button
              onClick={() => {
                haptic('light');
                setMethod('crypto');
              }}
              className={`flex flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition-all ${
                method === 'crypto'
                  ? 'border-white/40 bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                  : 'border-white/10 bg-white/[0.03] text-txt2 hover:bg-white/[0.06]'
              }`}
            >
              <Sparkles size={20} className={method === 'crypto' ? 'text-white' : 'text-zinc-500'} />
              <div>
                <div className="text-xs font-bold text-white">Криптовалюта</div>
                <div className="text-[10.5px] text-txt2">RollyPay / USDT</div>
              </div>
            </button>
          </div>
        </div>

        {/* Polling State & Direct Link */}
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
          <GradientButton onClick={handleTopup} loading={loading}>
            Пополнить на {amount || minTopup} ₽
          </GradientButton>
        )}
      </div>
    </BottomSheet>
  );
}
