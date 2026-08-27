import { Tag } from 'lucide-react';
import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { GradientButton } from './GradientButton';
import { hapticNotify, showAlert } from '../lib/telegram';
import * as api from '../api/client';
import { useAppStore } from '../store/useAppStore';

interface PromoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PromoModal({ isOpen, onClose }: PromoModalProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useAppStore((s) => s.refresh);

  const handleApply = async () => {
    if (!code.trim()) {
      showAlert('Введите промокод');
      return;
    }

    setLoading(true);
    try {
      const res = await api.redeemPromo(code.trim().toUpperCase());
      hapticNotify('success');
      showAlert(res.message || 'Промокод успешно применён!');
      await refresh();
      onClose();
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Неверный промокод');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Активация промокода">
      <div className="space-y-4 py-2">
        <div className="relative">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="MISTER2026"
            className="w-full rounded-xl border border-white/15 bg-white/[0.04] p-3.5 pl-10 font-mono text-base font-bold uppercase text-white placeholder-zinc-600 focus:border-white/40 focus:outline-none"
          />
          <Tag size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>

        <p className="text-xs text-txt2">
          Введите промокод для получения скидки на тариф или мгновенного пополнения баланса
        </p>

        <GradientButton onClick={handleApply} loading={loading}>
          Активировать
        </GradientButton>
      </div>
    </BottomSheet>
  );
}
