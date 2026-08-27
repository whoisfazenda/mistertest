import { motion } from 'framer-motion';
import { useState } from 'react';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { Screen, ScreenHeader } from '../components/Screen';
import { EASE, formatRub } from '../lib/format';
import { hapticNotify, showAlert } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';
import * as api from '../api/client';

export default function PromoScreen() {
  const refresh = useAppStore((s) => s.refresh);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <ScreenHeader title="Промокод" />
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="space-y-3"
      >
        <GlassCard>
          <label className="block text-[13px] font-medium text-txt2">Код</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="MISTER100"
            className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-mono text-[15px] text-white outline-none uppercase focus:border-accent/50"
          />
        </GlassCard>
        <GradientButton
          disabled={code.trim().length < 2}
          loading={busy}
          onClick={() => {
            setBusy(true);
            void api
              .redeemPromo(code.trim())
              .then(async (result) => {
                await refresh();
                hapticNotify('success');
                showAlert(`Промокод активирован. Баланс: ${formatRub(result.balance)}`);
                setCode('');
              })
              .catch((error: unknown) => {
                hapticNotify('error');
                showAlert(error instanceof Error ? error.message : 'Промокод не подошёл');
              })
              .finally(() => setBusy(false));
          }}
        >
          Активировать
        </GradientButton>
      </motion.div>
    </Screen>
  );
}
