import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
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
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="relative z-10 w-full max-w-md rounded-t-[32px] sm:rounded-[32px] bg-white p-6 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto text-[#0f172a]"
          >
            {/* Header Icon + Title matching screenshot 4 */}
            <div className="flex flex-col items-center justify-center text-center pb-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-3xl shadow-md mb-2">
                👛
              </div>
              <h3 className="text-lg font-black text-[#0f172a]">Пополнение баланса</h3>
              <p className="text-xs text-[#64748b] mt-0.5">Выберите удобный способ пополнения</p>
            </div>

            <div className="py-2 space-y-3">
              {/* Payment Methods List in exact rounded pill style */}
              <div className="space-y-2">
                {[
                  {
                    id: 'card' as const,
                    title: 'Банковская карта',
                    sub: 'Visa, MasterCard, МИР, СБП',
                    icon: '💳',
                  },
                  {
                    id: 'card_usd' as const,
                    title: 'Карты USD',
                    sub: 'Оплата картой в USD',
                    icon: '💲',
                  },
                  {
                    id: 'card_eur' as const,
                    title: 'Карты EUR',
                    sub: 'Оплата картой в EUR',
                    icon: '💶',
                  },
                  {
                    id: 'crypto' as const,
                    title: 'Криптовалюта',
                    sub: 'USDT и другие криптовалюты',
                    icon: '🪙',
                  },
                  {
                    id: 'xrocket' as const,
                    title: 'Telegram Stars',
                    sub: 'Оплата через Телеграм',
                    icon: '⭐',
                  },
                ].map((method) => {
                  const isSelected = selectedMethod === method.id || (selectedMethod === 'card' && method.id === 'card');
                  return (
                    <div
                      key={method.id}
                      onClick={() => {
                        haptic('light');
                        setSelectedMethod(method.id === 'card_usd' || method.id === 'card_eur' ? 'card' : method.id);
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#f0f9ff] border-2 border-[#38bdf8]'
                          : 'bg-[#f1f5f9] border-2 border-transparent hover:bg-[#e2e8f0]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{method.icon}</span>
                        <div>
                          <div className="text-xs font-bold text-[#0f172a]">{method.title}</div>
                          <div className="text-[10.5px] text-[#64748b]">{method.sub}</div>
                        </div>
                      </div>

                      <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? 'border-[#38bdf8] bg-[#38bdf8]' : 'border-[#cbd5e1] bg-white'}`}>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Amount selector */}
              <div className="space-y-1.5 pt-1">
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESET_AMOUNTS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handlePresetSelect(val)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all ${
                        amount === val
                          ? 'bg-[#0f172a] text-white shadow-sm'
                          : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
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
                    className="w-full rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-3 text-sm font-bold text-[#0f172a] focus:outline-none focus:border-[#38bdf8] pl-4 pr-10 font-mono"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#64748b]">₽</span>
                </div>
              </div>

              {/* Bottom Actions matching screenshot */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-12 items-center justify-center rounded-2xl bg-[#f1f5f9] text-xs font-bold text-[#0f172a] hover:bg-[#e2e8f0] active:scale-98 transition-transform"
                >
                  Назад
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleContinue}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#38bdf8] text-xs font-bold text-white shadow-md active:scale-98 transition-transform disabled:opacity-50"
                >
                  <span>{loading ? 'Создание...' : 'Продолжить'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
