import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronDown, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard, SectionTitle } from '../components/GlassCard';
import { Screen } from '../components/Screen';
import { EASE, staggerItem } from '../lib/format';
import { haptic, openLink, showAlert } from '../lib/telegram';
import { GradientButton } from '../components/GradientButton';
import * as api from '../api/client';
import { useAppStore } from '../store/useAppStore';

const FAQ = [
  {
    q: 'Как подключить устройство?',
    a: 'Скопируйте ссылку подписки или нажмите кнопку быстрого импорта (Happ, Incy, Karing, V2RayTun). Приложение автоматически добавит профиль и подключится.',
  },
  {
    q: 'Сколько устройств можно подключить одновременно?',
    a: 'Лимит устройств зависит от выбранного тарифа (от 1 до 10+ устройств). Список активных слотов и удаление старых устройств доступно во вкладке «Устройства».',
  },
  {
    q: 'Что делать, если VPN перестал подключаться?',
    a: '1. Нажмите «Обновить подписку» в приложении-клиенте. 2. Убедитесь, что подписка не заморожена и не истекла. 3. Если проблема сохраняется — напишите в поддержку.',
  },
  {
    q: 'Ведёте ли вы логи посещений?',
    a: 'Нет. Мы используем протоколы VLESS Reality и строго следуем политике No-Logs — история посещений, DNS-запросы и трафик никогда не записываются.',
  },
];

export default function SupportScreen() {
  const navigate = useNavigate();
  const supportUrl = useAppStore((s) => s.config?.supportUrl);
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  return (
    <Screen>
      <div className="space-y-4 pt-1">
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.08]"
        >
          <ArrowLeft size={16} />
          <span>Назад в профиль</span>
        </button>

        <GlassCard
          interactive
          className="flex items-center gap-4 p-4"
          onClick={() => {
            if (supportUrl) openLink(supportUrl);
            else haptic('light');
          }}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-inner">
            <MessageCircle size={24} strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-white text-sm">Написать в поддержку</h3>
            <p className="mt-0.5 text-xs text-txt2">Открыть прямой диалог в Telegram</p>
          </div>
        </GlassCard>

        <GlassCard className="p-4 space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-txt2">
            Обращение в поддержку
          </label>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Опишите ваш вопрос или проблему..."
            className="mt-1 min-h-24 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-white placeholder-zinc-600 outline-none focus:border-white/30"
          />
          <GradientButton
            className="!h-11 text-xs font-bold"
            disabled={message.trim().length < 5}
            loading={sending}
            onClick={() => {
              setSending(true);
              setError('');
              void api
                .createSupportTicket(message.trim())
                .then(() => {
                  setSent(true);
                  setMessage('');
                  showAlert('✅ Ваше обращение отправлено в поддержку');
                })
                .catch((err: unknown) => {
                  const text = err instanceof Error ? err.message : 'Не удалось отправить';
                  setError(text);
                  showAlert(text);
                })
                .finally(() => setSending(false));
            }}
          >
            Отправить обращение
          </GradientButton>
          {sent && <p className="mt-2 text-center text-xs text-white">Обращение создано</p>}
          {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}
        </GlassCard>

        <SectionTitle>Частые вопросы</SectionTitle>
        <motion.div
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          initial="hidden"
          animate="show"
          className="space-y-2.5"
        >
          {FAQ.map((item, i) => (
            <motion.div key={item.q} variants={staggerItem}>
              <GlassCard className="!p-0">
                <button
                  onClick={() => {
                    haptic('light');
                    setOpenIndex(openIndex === i ? null : i);
                  }}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <span className="flex-1 text-xs font-semibold text-white">{item.q}</span>
                  <motion.span
                    animate={{ rotate: openIndex === i ? 180 : 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="text-txt2"
                  >
                    <ChevronDown size={16} strokeWidth={1.5} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {openIndex === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <p className="px-4 pb-4 text-xs leading-relaxed text-txt2 border-t border-white/[0.04] pt-2">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Screen>
  );
}
