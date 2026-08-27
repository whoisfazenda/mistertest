import { motion } from 'framer-motion';
import { GlassCard } from '../components/GlassCard';
import { Screen, ScreenHeader } from '../components/Screen';
import { EASE } from '../lib/format';
import { useAppStore } from '../store/useAppStore';

export default function SettingsScreen() {
  const user = useAppStore((s) => s.user);
  const config = useAppStore((s) => s.config);

  return (
    <Screen>
      <ScreenHeader title="Настройки" />
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="space-y-3"
      >
        <GlassCard>
          <p className="text-[13px] text-txt2">Telegram ID</p>
          <p className="mt-1 font-mono">{user?.telegramId ?? '—'}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-[13px] text-txt2">Валюта</p>
          <p className="mt-1 font-semibold">{config?.currency ?? user?.currency ?? 'RUB'}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-[13px] text-txt2">Режим сервера</p>
          <p className="mt-1 font-semibold">Автоматический выбор</p>
        </GlassCard>
      </motion.div>
    </Screen>
  );
}
