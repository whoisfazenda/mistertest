import { Check, Copy, ExternalLink, Laptop, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hapticNotify, openLink, showAlert } from '../lib/telegram';

interface DeepLinkButtonsProps {
  subscriptionUrl: string;
}

export function DeepLinkButtons({ subscriptionUrl }: DeepLinkButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [activeClient, setActiveClient] = useState<string | null>(null);
  const navigate = useNavigate();

  if (!subscriptionUrl) return null;

  const handleOpen = (name: string, type: 'happ' | 'karing' | 'incy' | 'v2raytun' | 'hiddify' | 'streisand') => {
    if (!subscriptionUrl) {
      showAlert('Ссылка подписки пока недоступна');
      return;
    }

    hapticNotify('success');
    setActiveClient(name);
    setTimeout(() => setActiveClient(null), 2500);

    // Build full HTTPS redirect URL for Telegram WebApp sandbox bypass
    const origin = window.location.origin;
    const redirectUrl = `${origin}/miniapp/import/${type}?url=${encodeURIComponent(subscriptionUrl)}`;

    try {
      openLink(redirectUrl);
    } catch {
      window.open(redirectUrl, '_blank');
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(subscriptionUrl);
      setCopied(true);
      hapticNotify('success');
      showAlert('✅ Ссылка подписки скопирована в буфер обмена!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt('Скопируйте ссылку подписки:', subscriptionUrl);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-white" />
          <span className="text-[12px] font-bold uppercase tracking-wider text-white">
            Быстрый импорт в 1 клик
          </span>
        </div>
        <button
          onClick={() => navigate('/devices')}
          className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-white"
        >
          <Laptop size={12} />
          <span>Инструкция</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleOpen('Happ', 'happ')}
          className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 text-left transition-all hover:bg-white/[0.08] active:scale-[0.98]"
        >
          <div>
            <div className="font-bold text-white text-sm">Happ</div>
            <div className="text-[11px] text-txt2">{activeClient === 'Happ' ? '⚡ Открываем...' : 'iOS · Android · Win · Mac'}</div>
          </div>
          <ExternalLink size={14} className="text-zinc-500" />
        </button>

        <button
          onClick={() => handleOpen('Karing', 'karing')}
          className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 text-left transition-all hover:bg-white/[0.08] active:scale-[0.98]"
        >
          <div>
            <div className="font-bold text-white text-sm">Karing</div>
            <div className="text-[11px] text-txt2">{activeClient === 'Karing' ? '⚡ Открываем...' : 'iOS · Android · PC'}</div>
          </div>
          <ExternalLink size={14} className="text-zinc-500" />
        </button>

        <button
          onClick={() => handleOpen('Incy', 'incy')}
          className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 text-left transition-all hover:bg-white/[0.08] active:scale-[0.98]"
        >
          <div>
            <div className="font-bold text-white text-sm">Incy</div>
            <div className="text-[11px] text-txt2">{activeClient === 'Incy' ? '⚡ Открываем...' : 'iOS · Android'}</div>
          </div>
          <ExternalLink size={14} className="text-zinc-500" />
        </button>

        <button
          onClick={() => handleOpen('v2RayTun', 'v2raytun')}
          className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 text-left transition-all hover:bg-white/[0.08] active:scale-[0.98]"
        >
          <div>
            <div className="font-bold text-white text-sm">v2RayTun</div>
            <div className="text-[11px] text-txt2">{activeClient === 'v2RayTun' ? '⚡ Открываем...' : 'iOS · Android · Win'}</div>
          </div>
          <ExternalLink size={14} className="text-zinc-500" />
        </button>
      </div>

      <button
        onClick={copyUrl}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] py-2.5 text-xs font-bold text-white transition-colors hover:bg-white/[0.09]"
      >
        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        <span>{copied ? '✅ Ссылка скопирована в буфер!' : 'Скопировать прямую ссылку подписки'}</span>
      </button>
    </div>
  );
}
