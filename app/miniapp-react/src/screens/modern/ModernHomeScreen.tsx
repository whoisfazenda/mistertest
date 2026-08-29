import { useState } from 'react';
import { Plus, ShieldAlert, ChevronRight, Zap, RefreshCw, Trash2, Smartphone } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { formatRub } from '../../lib/format';
import { haptic, hapticNotify, showAlert } from '../../lib/telegram';
import { ModernDeviceModal } from './ModernDeviceModal';
import { ModernTopupModal } from './ModernTopupModal';
import * as api from '../../api/client';

interface ModernHomeScreenProps {
  onNavigateTab: (tab: string) => void;
}

export function ModernHomeScreen({ onNavigateTab }: ModernHomeScreenProps) {
  const user = useAppStore((s) => s.user);
  const subscription = useAppStore((s) => s.subscription);
  const devices = useAppStore((s) => s.devices);
  const refresh = useAppStore((s) => s.refresh);

  const [topupOpen, setTopupOpen] = useState(false);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeBanner] = useState(0);

  const balance = Number(user?.balance ?? 0);
  const hasSub = Boolean(subscription?.isActive);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      haptic('light');
      await refresh();
      hapticNotify('success');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Отключить это устройство?')) return;
    try {
      haptic('medium');
      await api.deleteDevice(deviceId);
      await refresh();
      hapticNotify('success');
      showAlert('Устройство отключено');
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка удаления устройства');
    }
  };

  const banners = [
    {
      icon: '🌍',
      title: 'Неограниченная скорость до 10 Гбит/с',
      desc: 'Подключайтесь через ультрасовременные протоколы VLESS и Shadowsocks.',
    },
    {
      icon: '🛡️',
      title: 'Полная анонимность без логов',
      desc: 'Ваш реальный IP-адрес и история посещений надежно зашифрованы.',
    },
  ];

  return (
    <div className="space-y-5 pb-24 select-none">
      {/* 1. TOP BRAND & USER ROW */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-white to-zinc-400 text-black font-black text-lg shadow-lg">
            M
          </div>
          <div>
            <div className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5">
              <span>{user?.firstName || 'Mister User'}</span>
              {user?.isAdmin && <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded font-mono">ADMIN</span>}
            </div>
            <div className="text-xs text-txt3 font-medium">@{user?.username || 'user'}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-txt2 hover:text-white"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-bold text-txt2">
            <Zap size={12} className="text-amber-400" />
            <span>10 Gbps</span>
          </div>
        </div>
      </div>

      {/* 2. BIG BALANCE CENTERPIECE */}
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-6 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-bold text-txt3 uppercase tracking-wider">
          <span>💳 Ваш баланс</span>
        </div>

        <div className="my-2 font-mono text-4xl sm:text-5xl font-black tracking-tight text-white">
          {formatRub(balance)}
        </div>

        {/* Sub Info Row */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold text-txt3">
          <span className="rounded-xl bg-white/[0.04] px-2.5 py-1 border border-white/5">
            Тариф: {subscription?.planName || 'Без подписки'}
          </span>
          <span className="rounded-xl bg-white/[0.04] px-2.5 py-1 border border-white/5">
            Устройств: {devices.length} / {subscription?.devicesMax || 5}
          </span>
          <span className={`rounded-xl px-2.5 py-1 border font-bold ${hasSub ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
            {hasSub ? '● Активна' : '○ Приостановлена'}
          </span>
        </div>
      </div>

      {/* 3. 3D QUICK ACTION BUTTONS */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Top up */}
        <button
          type="button"
          onClick={() => {
            haptic('medium');
            setTopupOpen(true);
          }}
          className="flex flex-col items-center justify-center p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] active:scale-95 transition-all shadow-lg group"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-2xl shadow-md group-hover:scale-105 transition-transform">
            👛
          </div>
          <span className="mt-2 text-xs font-bold text-white">Пополнить</span>
        </button>

        {/* Setup / Connect */}
        <button
          type="button"
          onClick={() => {
            haptic('medium');
            setDeviceModalOpen(true);
          }}
          className="flex flex-col items-center justify-center p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] active:scale-95 transition-all shadow-lg group"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-sky-400 text-2xl shadow-md group-hover:scale-105 transition-transform">
            💻
          </div>
          <span className="mt-2 text-xs font-bold text-white">Установить</span>
        </button>

        {/* History / Transactions */}
        <button
          type="button"
          onClick={() => {
            haptic('medium');
            onNavigateTab('history');
          }}
          className="flex flex-col items-center justify-center p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] active:scale-95 transition-all shadow-lg group"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-zinc-600 to-zinc-400 text-2xl shadow-md group-hover:scale-105 transition-transform">
            🧾
          </div>
          <span className="mt-2 text-xs font-bold text-white">История</span>
        </button>
      </div>

      {/* 4. NOTIFICATION / PROMO BANNER */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{banners[activeBanner].icon}</span>
            <div>
              <div className="text-xs font-bold text-white">{banners[activeBanner].title}</div>
              <div className="text-[11px] text-txt3 line-clamp-1">{banners[activeBanner].desc}</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-txt3" />
        </div>
      </div>

      {/* 5. DEVICES LIST SECTION */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Устройства</h3>
          <button
            type="button"
            onClick={() => {
              haptic('medium');
              setDeviceModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white font-bold text-black text-xs shadow-md active:scale-95 transition-transform"
          >
            <Plus size={14} />
            <span>Добавить</span>
          </button>
        </div>

        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-white/5 bg-white/[0.02] p-8 text-center">
            <ShieldAlert size={28} className="text-txt3 mb-2 opacity-60" />
            <p className="text-xs font-bold text-white">Нет подключённых устройств</p>
            <p className="text-[11px] text-txt3 mt-1">Нажмите «Добавить», чтобы настроить VPN на телефоне или ПК</p>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-white/[0.03]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
                    <Smartphone size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{d.name || d.deviceModel || 'Устройство'}</div>
                    <div className="text-[10px] text-txt3 font-mono">IP: {d.ip || 'Недавно'}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteDevice(d.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <ModernTopupModal isOpen={topupOpen} onClose={() => setTopupOpen(false)} />
      <ModernDeviceModal isOpen={deviceModalOpen} onClose={() => setDeviceModalOpen(false)} />
    </div>
  );
}
