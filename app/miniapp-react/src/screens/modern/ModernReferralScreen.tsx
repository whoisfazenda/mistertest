import { useState, useEffect } from 'react';
import { Plus, Check, Copy } from 'lucide-react';
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
      showAlert('✅ Ссылка скопирована!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showAlert(referralLink);
    }
  };

  const handleShare = () => {
    haptic('medium');
    const shareText = '🚀 Подключай сверхбыстрый и безопасный Mister VPN!';
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
    window.location.href = shareUrl;
  };

  const handleWithdraw = () => {
    haptic('medium');
    showAlert('Для вывода реферальных средств напишите в нашу поддержку: @misterfvpn_bot');
  };

  return (
    <div className="space-y-4 pb-24 select-none max-w-xl mx-auto">
      {/* Title & Subtitle matching screenshot 2 */}
      <div className="text-center pt-2 space-y-1">
        <h2 className="text-xl font-black text-[#0f172a]">Реферальный бонус</h2>
        <p className="text-xs text-[#64748b] max-w-sm mx-auto">
          Приглашайте друзей в Mister VPN и получайте доход от их пополнений
        </p>
      </div>

      {/* Main Card matching screenshot 2 */}
      <div className="rounded-[28px] bg-white/80 backdrop-blur-md p-5 shadow-sm border border-white/60 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-[#64748b] flex items-center gap-1.5">
              <span>💼 Заработано:</span>
            </div>
            <div className="text-3xl font-black font-mono text-[#0f172a] mt-0.5">
              {formatRub(info?.earned || 0)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleWithdraw}
            className="px-4 py-1.5 rounded-xl bg-white border border-[#e2e8f0] text-xs font-bold text-[#0f172a] hover:bg-[#f8fafc] shadow-xs active:scale-95 transition-all"
          >
            Вывести
          </button>
        </div>

        {/* 3 Stats Columns in white box */}
        <div className="grid grid-cols-3 gap-2 bg-[#f8fafc] rounded-2xl p-3 border border-[#f1f5f9] text-center">
          <div>
            <div className="font-mono text-base font-bold text-[#0f172a] flex items-center justify-center gap-1">
              <span>{info?.invited || 0}</span>
              <span className="text-xs font-normal text-[#64748b]">👤</span>
            </div>
            <div className="text-[11px] text-[#64748b] mt-0.5">Переходов</div>
          </div>

          <div className="border-x border-[#e2e8f0]">
            <div className="font-mono text-base font-bold text-[#0f172a] flex items-center justify-center gap-1">
              <span>{info?.bonus || 0}</span>
              <span className="text-xs font-normal text-[#64748b]">👤</span>
            </div>
            <div className="text-[11px] text-[#64748b] mt-0.5">Оплатили</div>
          </div>

          <div>
            <div className="font-mono text-base font-bold text-[#0f172a] flex items-center justify-center gap-1">
              <span>{formatRub(info?.earned || 0)}</span>
            </div>
            <div className="text-[11px] text-[#64748b] mt-0.5">Оплачено</div>
          </div>
        </div>

        {/* Big Blue CTA Button */}
        <button
          type="button"
          onClick={handleShare}
          className="flex w-full h-12 items-center justify-center rounded-2xl bg-[#38bdf8] font-bold text-white text-sm shadow-md hover:bg-[#0284c7] active:scale-98 transition-all"
        >
          <span>Пригласить</span>
        </button>
      </div>

      {/* Referral Links Section matching screenshot 2 */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-[#0f172a]">Мои реферальные ссылки</h3>
            <p className="text-[10px] text-[#64748b]">Создание ссылок и статистика</p>
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1 px-3 py-1 rounded-xl bg-white border border-[#e2e8f0] font-bold text-[#0f172a] text-xs shadow-xs"
          >
            <Plus size={13} />
            <span>Создать</span>
          </button>
        </div>

        {/* Main Link card */}
        <div className="text-[11px] text-[#64748b] font-bold">Основная ссылка</div>
        <div
          onClick={handleCopyLink}
          className="flex items-center justify-between p-3.5 rounded-2xl bg-white/80 backdrop-blur-md border border-white/60 shadow-xs cursor-pointer hover:bg-white transition-all"
        >
          <div className="space-y-0.5 max-w-[85%]">
            <div className="text-xs font-bold text-[#0f172a]">Основная ссылка</div>
            <div className="text-[11px] text-[#64748b] font-mono truncate">{referralLink}</div>
          </div>
          <div className="text-[#64748b]">
            {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
          </div>
        </div>

        {/* Custom links empty container */}
        <div className="text-[11px] text-[#64748b] font-bold pt-1">Кастомные ссылки</div>
        <div className="rounded-2xl bg-white/70 backdrop-blur-md p-6 text-center text-xs text-[#94a3b8] border border-white/60">
          Кастомных ссылок пока нет
        </div>
      </div>
    </div>
  );
}
