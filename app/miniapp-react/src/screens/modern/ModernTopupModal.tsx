import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, CreditCard, Coins, Star, ArrowRight, ShieldCheck } from 'lucide-react';
import { haptic, hapticNotify, showAlert } from '../../lib/telegram';
import { useAppStore } from '../../store/useAppStore';
import * as api from '../../api/client';
import type { PaymentMethod } from '../../api/client';

interface ModernTopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const PRESET_AMOUNTS = [100, 300, 500, 1000, 2500];

export function ModernTopupModal({ isOpen, onClose, onSuccess }: ModernTopupModalProps) {
  const config = useAppStore((s) => s.config);
  const refresh = useAppStore((s) => s.refresh);
  const [amount, setAmount] = useState<number>(300);
  const [customAmount, setCustomAmount] = useState<string>('300');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('card');
  const [loading, setLoading] = useState(false);

  const minTopup = config?.minTopup || 50;
  const maxTopup = config?.maxTopup || 10000;

  const handlePresetSelect = (val: number) => {
    haptic('light');
    setAmount(val);
    setCustomAmount(String(val));
  };

  const handleCustomChange = (val: string) => {
    setCustomAmount(val);
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      setAmount(num);
    }
  };

  const handleContinue = async () => {
    if (amount < minTopup) {
      showAlert(`Минимальная сумма пополнения: ${minTopup} ₽`);
      return;
    }
    if (amount > maxTopup) {
      showAlert(`Максимальная сумма пополнения: ${maxTopup} ₽`);
      return;
    }

    try {
      setLoading(true);
      haptic('medium');
      const res = await api.topUp(amount, selectedMethod as any);
      if (res.completed) {
        hapticNotify('success');
        showAlert('✅ Баланс успешно пополнен!');
        await refresh();
        onSuccess?.();
        onClose();
      } else if (res.confirmationUrl) {
        window.location.href = res.confirmationUrl;
      } else {
        showAlert(res.message || 'Счет на оплату сформирован.');
      }
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Ошибка создания платежа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 select-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] border border-white/15 bg-[#0a0a0f] p-6 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-black font-black shadow-lg">
                  👛
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Пополнение баланса</h3>
                  <p className="text-[11px] text-txt3">Выберите удобный способ оплаты</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="space-y-2">
                {[
                  {
                    id: 'card' as const,
                    title: 'Банковская карта РФ / СБП',
                    sub: 'МИР, Visa, MasterCard, СБП без комиссии',
                    icon: CreditCard,
                    badge: 'Популярно',
                  },
                  {
                    id: 'crypto' as const,
                    title: 'Криптовалюта (USDT / TON / BTC)',
                    sub: 'USDT TRC20, TON, BTC, CryptoBot',
                    icon: Coins,
                  },
                  {
                    id: 'xrocket' as const,
                    title: 'Telegram Stars / xRocket',
                    sub: 'Оплата через встроенные Telegram сервисы',
                    icon: Star,
                  },
                ].map((method) => {
                  const isSelected = selectedMethod === method.id;
                  const Icon = method.icon;
                  return (
                    <div
                      key={method.id}
                      onClick={() => {
                        haptic('light');
                        setSelectedMethod(method.id);
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-white/40 bg-white/[0.1] shadow-lg shadow-white/[0.03]'
                          : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isSelected ? 'bg-white text-black' : 'bg-white/10 text-white'}`}>
                          <Icon size={20} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>{method.title}</span>
                            {method.badge && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                                {method.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-txt3">{method.sub}</div>
                        </div>
                      </div>

                      <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? 'border-white bg-white' : 'border-white/20'}`}>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-black" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-txt3">Сумма пополнения (₽)</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESET_AMOUNTS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handlePresetSelect(val)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        amount === val
                          ? 'bg-white text-black border-white shadow-md'
                          : 'bg-white/5 text-txt2 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {val} ₽
                    </button>
                  ))}
                </div>

                <div className="relative mt-2">
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => handleCustomChange(e.target.value)}
                    placeholder="Другая сумма"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 text-sm font-bold text-white focus:outline-none focus:border-white/30 pl-4 pr-12 font-mono"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-txt3">₽</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11.5px] text-txt3 bg-white/[0.02] border border-white/5 rounded-xl p-2.5">
                <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                <span>Мгновенное автоматическое зачисление средств без комиссии.</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-xs font-bold text-white hover:bg-white/10 active:scale-98 transition-transform"
                >
                  Назад
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleContinue}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-white to-zinc-300 text-xs font-bold text-black shadow-xl active:scale-98 transition-transform disabled:opacity-50"
                >
                  <span>{loading ? 'Создание счета...' : 'Продолжить'}</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
