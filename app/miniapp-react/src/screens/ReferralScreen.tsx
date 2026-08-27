import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { Screen, ScreenHeader } from '../components/Screen';
import { EASE, formatRub } from '../lib/format';
import { hapticNotify, showAlert } from '../lib/telegram';
import * as api from '../api/client';
import type { ReferralInfo } from '../api/client';

export default function ReferralScreen() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);

  useEffect(() => {
    void api.getReferral().then(setInfo).catch((error: unknown) => {
      showAlert(error instanceof Error ? error.message : 'Не удалось загрузить реферальную программу');
    });
  }, []);

  return (
    <Screen>
      <ScreenHeader title="Рефералы" />
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="space-y-3"
      >
        <GlassCard>
          <p className="text-[13px] text-txt2">
            За первую покупку друга вы получите {info ? formatRub(info.bonus) : 'бонус'}.
          </p>
          <p className="mt-3 font-semibold">Приглашено: {info?.invited ?? '—'}</p>
          <p className="mt-1 font-semibold">Начислено: {info ? formatRub(info.earned) : '—'}</p>
        </GlassCard>
        {info?.link && (
          <GradientButton
            onClick={() => {
              void navigator.clipboard.writeText(info.link).then(
                () => {
                  hapticNotify('success');
                  showAlert('Ссылка скопирована');
                },
                () => showAlert(info.link),
              );
            }}
          >
            Скопировать ссылку
          </GradientButton>
        )}
      </motion.div>
    </Screen>
  );
}
