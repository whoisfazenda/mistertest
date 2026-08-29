import { useState, useEffect } from 'react';
import { Share2, Plus, ArrowUpRight, Check, Copy } from 'lucide-react';
import { formatRub } from '../../lib/format';
import { haptic, hapticNotify, showAlert } from '../../lib/telegram';
import * as api from '../../api/client';
import type { ReferralInfo } from '../../api/client';

export function ModernReferralScreen() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void api.getReferral().then(setInfo).catch(() => {});
  }, []);

  const referralLink = info?.link || `https://t.me/misterfvpn_bot?start=ref_${info?.invited || ''}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      hapticNotify('success');
      showAlert('✅ Ваша реферальная ссылка скопирована!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showAlert(referralLink);
    }
  };

  const handleShare = () => {
    haptic('medium');
    const shareText = '🚀 Подключай сверхбыстрый и безопасный Mister VPN без замедлений!';
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
    window.location.href = shareUrl;
  };

  const handleWithdraw = () => {
    haptic('medium');
    showAlert('Для вывода реферальных средств напишите в нашу техподдержку: @misterfvpn_bot');
  };

  return (
    <div className="space-y-5 pb-24 select-none">
      <div className="text-center pt-2 space-y-1">
        <h2 className="text-xl font-black text-white">Реферальный бонус</h2>
        <p className="text-xs text-txt3 max-w-xs mx-auto">
          Приглашайте друзей в Mister VPN и получайте пожизненный доход от их пополнений!
        </p>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-txt3 flex items-center gap-1.5">
              <span>💼 Заработано:</span>
            </div>
            <div className="text-3xl font-black font-mono text-white mt-1">
              {formatRub(info?.earned || 0)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleWithdraw}
            className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white/[0.08] border border-white/15 text-xs font-bold text-white hover:bg-white/15 active:scale-95 transition-transform"
          >
            <span>Вывести</span>
            <ArrowUpRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
          <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3 text-center">
            <div className="font-mono text-base font-bold text-white">{info?.invited || 0}</div>
            <div className="text-[10px] text-txt3 mt-0.5">Переходов</div>
          </div>

          <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3 text-center">
            <div className="font-mono text-base font-bold text-emerald-400">{formatRub(info?.bonus || 50)}</div>
            <div className="text-[10px] text-txt3 mt-0.5">Бонус / друг</div>
          </div>

          <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3 text-center">
            <div className="font-mono text-base font-bold text-amber-300">{formatRub(info?.earned || 0)}</div>
            <div className="text-[10px] text-txt3 mt-0.5">Оплачено</div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleShare}
          className="flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-white to-zinc-300 font-bold text-black text-sm shadow-xl active:scale-98 transition-transform"
        >
          <Share2 size={16} />
          <span>Пригласить</span>
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Мои реферальные ссылки</h3>
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 font-bold text-white text-xs border border-white/10"
          >
            <Plus size={13} />
            <span>Создать</span>
          </button>
        </div>

        <div
          onClick={handleCopyLink}
          className="flex items-center justify-between p-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer transition-all"
        >
          <div className="space-y-1 max-w-[80%]">
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Основная ссылка</span>
            </div>
            <div className="text-[11px] text-txt3 font-mono truncate">{referralLink}</div>
          </div>

          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black shadow-md">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-6 text-center text-xs text-txt3">
          Кастомных ссылок пока нет
        </div>
      </div>
    </div>
  );
}
