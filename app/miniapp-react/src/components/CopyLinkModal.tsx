import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, Copy, Check, Globe, Shield, QrCode } from 'lucide-react';
import { hapticNotify, showAlert } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';

interface CopyLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CopyLinkModal({ isOpen, onClose }: CopyLinkModalProps) {
  const subscription = useAppStore((s) => s.subscription);
  const [copiedMain, setCopiedMain] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const mainUrl = subscription?.subscriptionUrl || subscription?.publicUrl || '';
  const backupUrl = subscription?.fallbackUrl || subscription?.directUrl || '';

  const handleCopy = async (url: string, isBackup = false) => {
    if (!url) {
      showAlert('Ссылка пока недоступна');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      if (isBackup) {
        setCopiedBackup(true);
        setTimeout(() => setCopiedBackup(false), 2500);
      } else {
        setCopiedMain(true);
        setTimeout(() => setCopiedMain(false), 2500);
      }
      hapticNotify('success');
    } catch {
      prompt('Скопируйте ссылку:', url);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            className="relative z-10 w-full max-w-md rounded-t-[28px] sm:rounded-[28px] border border-white/10 bg-[#0d0d12] p-5 shadow-2xl backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.08] text-white">
                  <Copy size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base leading-tight">Скопировать ссылку</h3>
                  <p className="text-[11px] text-zinc-400">Выберите подходящую ссылку подписки</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-zinc-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="py-4 space-y-3.5">
              {/* Subscription UUID */}
              {subscription?.uuid && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-txt3">ID подписки (UUID)</span>
                    <span className="text-[10px] font-semibold text-zinc-400">AdaptGroup</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-black/50 rounded-xl p-2.5 border border-white/5">
                    <span className="font-mono text-[11px] text-zinc-300 truncate select-all">{subscription.uuid}</span>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(subscription.uuid);
                          hapticNotify('success');
                          showAlert('ID подписки скопирован!');
                        } catch {
                          prompt('ID подписки:', subscription.uuid);
                        }
                      }}
                      className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors shrink-0"
                      title="Скопировать ID"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              )}

              {/* Main Link */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe size={15} className="text-sky-400" />
                    <span className="font-bold text-xs text-white">Основная ссылка (Рекомендуется)</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    sub.misterv.site
                  </span>
                </div>
                <div className="font-mono text-[11px] text-zinc-300 bg-black/50 rounded-xl p-2.5 break-all border border-white/5 select-all">
                  {mainUrl || 'Загрузка...'}
                </div>
                <button
                  onClick={() => handleCopy(mainUrl, false)}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-white text-black font-bold text-xs transition-all hover:bg-zinc-200 active:scale-[0.98] shadow-sm"
                >
                  {copiedMain ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  <span>{copiedMain ? '✅ Основная ссылка скопирована!' : 'Скопировать основную ссылку'}</span>
                </button>
              </div>

              {/* Backup Link */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield size={15} className="text-amber-400" />
                    <span className="font-bold text-xs text-white">Резервная ссылка</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    На случай сбоев
                  </span>
                </div>
                <div className="font-mono text-[11px] text-zinc-400 bg-black/50 rounded-xl p-2.5 break-all border border-white/5 select-all">
                  {backupUrl || 'Загрузка...'}
                </div>
                <button
                  onClick={() => handleCopy(backupUrl, true)}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] text-white font-bold text-xs transition-all hover:bg-white/[0.1] active:scale-[0.98]"
                >
                  {copiedBackup ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedBackup ? '✅ Резервная ссылка скопирована!' : 'Скопировать резервную ссылку'}</span>
                </button>
              </div>

              {/* QR Code toggle */}
              <button
                onClick={() => setShowQr(!showQr)}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 font-semibold text-xs hover:bg-white/[0.08] transition-colors"
              >
                <QrCode size={15} />
                <span>{showQr ? 'Скрыть QR-код' : 'Показать QR-код для подключения'}</span>
              </button>

              {showQr && (
                <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white text-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data=${encodeURIComponent(mainUrl)}`}
                    alt="QR"
                    className="h-44 w-44 rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://quickchart.io/qr?size=220&margin=1&text=${encodeURIComponent(mainUrl)}`;
                    }}
                  />
                  <span className="text-[11px] text-zinc-700 font-bold mt-2">
                    Отсканируйте в приложении Happ / Incy / Karing
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
