import { Check, Copy, ExternalLink, QrCode } from 'lucide-react';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BottomSheet } from './BottomSheet';
import { GradientButton } from './GradientButton';
import { hapticNotify, openLink } from '../lib/telegram';

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title?: string;
}

export function QrModal({ isOpen, onClose, url, title = 'QR-код для подключения' }: QrModalProps) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      hapticNotify('success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Скопируйте ссылку:', url);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col items-center space-y-4 py-2">
        {/* Offline Vector QR Code Container */}
        <div className="flex h-[230px] w-[230px] items-center justify-center rounded-2xl bg-white p-3 shadow-[0_0_30px_rgba(255,255,255,0.18)]">
          {url ? (
            <QRCodeSVG
              value={url}
              size={204}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
              includeMargin={false}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center text-black">
              <QrCode size={36} className="text-zinc-400" />
              <p className="mt-2 text-xs font-medium text-zinc-500">Ссылка недоступна</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-txt2 px-2">
          Отсканируйте камерой в приложении (Happ, Incy, Karing, V2RayTun) или скопируйте ссылку
        </p>

        {/* Copy Link Box */}
        <div
          onClick={copyUrl}
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.08]"
        >
          <span className="truncate font-mono text-xs text-txt2">{url || '—'}</span>
          <span className="shrink-0 text-white">
            {copied ? <Check size={16} className="text-white" /> : <Copy size={16} />}
          </span>
        </div>

        <div className="flex w-full gap-2">
          <GradientButton onClick={copyUrl} className="flex-1 !h-12 text-xs font-bold">
            {copied ? 'Скопировано!' : 'Скопировать ссылку'}
          </GradientButton>
          {url && (
            <button
              onClick={() => openLink(url)}
              className="flex h-12 w-12 items-center justify-center rounded-btn border border-white/15 bg-white/[0.05] text-white transition-colors hover:bg-white/10"
              title="Открыть в браузере"
            >
              <ExternalLink size={18} />
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
