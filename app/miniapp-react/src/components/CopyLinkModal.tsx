import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, Copy, Check, Globe, QrCode, Zap } from 'lucide-react';
import { hapticNotify, showAlert } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';

interface CopyLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CopyLinkModal({ isOpen, onClose }: CopyLinkModalProps) {
  const subscription = useAppStore((s) => s.subscription);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrUrl, setQrUrl] = useState<string>('');

  const uuid = subscription?.uuid || '';
  const ruUrl =
    subscription?.ruUrl ||
    (uuid ? `https://ru.misterv.site/${uuid}` : '') ||
    subscription?.subscriptionUrl ||
    subscription?.publicUrl ||
    '';
  const subUrl =
    subscription?.subUrl ||
    (uuid ? `https://sub.misterv.site/${uuid}` : '') ||
    '';
  const backupUrl =
    subscription?.directUrl ||
    subscription?.fallbackUrl ||
    '';

  const activeQrTarget = qrUrl || ruUrl || subUrl || backupUrl;

  const handleCopy = async (url: string, key: string) => {
    if (!url) {
      showAlert('Ссылка пока недоступна');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 2500);
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
            className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] border border-white/10 bg-[#0d0d12] p-5 shadow-2xl backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.08] text-white">
                  <Copy size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base leading-tight">Ссылки для подключения</h3>
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
              {/* 1. Main Link RU (Доступна из РФ) */}
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.03] p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe size={15} className="text-sky-400" />
                    <span className="font-bold text-xs text-white">Основная («доступна из РФ»)</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                    ru.misterv.site
                  </span>
                </div>
                <div className="font-mono text-[11px] text-zinc-300 bg-black/50 rounded-xl p-2.5 break-all border border-white/5 select-all">
                  {ruUrl || 'Загрузка...'}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(ruUrl, 'ru')}
                    className="flex-1 flex h-9 items-center justify-center gap-2 rounded-xl bg-white text-black font-bold text-xs transition-all hover:bg-zinc-200 active:scale-[0.98] shadow-sm"
                  >
                    {copiedKey === 'ru' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    <span>{copiedKey === 'ru' ? '✅ Скопировано!' : 'Скопировать (РФ)'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setQrUrl(ruUrl);
                      setShowQr(true);
                    }}
                    title="QR-код для РФ ссылки"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]"
                  >
                    <QrCode size={15} />
                  </button>
                </div>
              </div>

              {/* 2. Main Link Sub (Недоступна из РФ) */}
              {subUrl && (
                <div className="rounded-2xl border border-purple-500/20 bg-purple-500/[0.03] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe size={15} className="text-purple-400" />
                      <span className="font-bold text-xs text-white">Основная («недоступна из РФ»)</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                      sub.misterv.site
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-zinc-300 bg-black/50 rounded-xl p-2.5 break-all border border-white/5 select-all">
                    {subUrl}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(subUrl, 'sub')}
                      className="flex-1 flex h-9 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] text-white font-bold text-xs transition-all hover:bg-white/[0.15] active:scale-[0.98]"
                    >
                      {copiedKey === 'sub' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedKey === 'sub' ? '✅ Скопировано!' : 'Скопировать (вне РФ)'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setQrUrl(subUrl);
                        setShowQr(true);
                      }}
                      title="QR-код для зарубежной ссылки"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]"
                    >
                      <QrCode size={15} />
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Backup Link (network / прямой IP) */}
              {backupUrl && backupUrl !== ruUrl && backupUrl !== subUrl && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap size={15} className="text-amber-400" />
                      <span className="font-bold text-xs text-white">Резервная (network / IP)</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      Прямая
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400 bg-black/50 rounded-xl p-2.5 break-all border border-white/5 select-all">
                    {backupUrl}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(backupUrl, 'backup')}
                      className="flex-1 flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] text-white font-bold text-xs transition-all hover:bg-white/[0.1] active:scale-[0.98]"
                    >
                      {copiedKey === 'backup' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedKey === 'backup' ? '✅ Скопировано!' : 'Скопировать резервную'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setQrUrl(backupUrl);
                        setShowQr(true);
                      }}
                      title="QR-код для резервной ссылки"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]"
                    >
                      <QrCode size={15} />
                    </button>
                  </div>
                </div>
              )}

              {/* QR Code toggle */}
              <button
                onClick={() => {
                  if (!qrUrl) setQrUrl(ruUrl);
                  setShowQr(!showQr);
                }}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 font-semibold text-xs hover:bg-white/[0.08] transition-colors"
              >
                <QrCode size={15} />
                <span>{showQr ? 'Скрыть QR-код' : 'Показать QR-код для подключения'}</span>
              </button>

              {showQr && activeQrTarget && (
                <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white text-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data=${encodeURIComponent(activeQrTarget)}`}
                    alt="QR"
                    className="h-44 w-44 rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://quickchart.io/qr?size=220&margin=1&text=${encodeURIComponent(activeQrTarget)}`;
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
