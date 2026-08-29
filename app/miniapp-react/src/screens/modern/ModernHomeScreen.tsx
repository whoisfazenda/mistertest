import { useState } from 'react';
import { RefreshCw, Trash2, Smartphone, Plus, ChevronRight, AlertTriangle } from 'lucide-react';
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

  return (
    <div className="space-y-4 pb-24 select-none max-w-xl mx-auto">
      {/* 1. Centerpiece Balance Block matching screenshot 1 */}
      <div className="flex flex-col items-center justify-center text-center pt-2">
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/70 backdrop-blur-md px-3.5 py-1 text-xs font-semibold text-[#0f172a] shadow-xs hover:bg-white transition-all"
        >
          <RefreshCw size={13} className={`text-[#64748b] ${refreshing ? 'animate-spin' : ''}`} />
          <span>Ваш баланс</span>
        </button>

        <div className="my-1 font-mono text-5xl font-black tracking-tight text-[#0f172a]">
          {formatRub(balance)}
        </div>

        {/* Sub Info Row */}
        <div className="flex items-center justify-center gap-3 text-xs text-[#64748b]">
          <span>Тариф: {subscription?.planName || '0 ₽ / день'}</span>
          <span>Устройств: {devices.length}</span>
          <span className={hasSub ? 'text-emerald-600 font-medium' : 'text-rose-500 font-medium'}>
            {hasSub ? 'Подписка активна' : 'Подписка приостановлена'}
          </span>
        </div>
      </div>

      {/* 2. 3D Quick Action Icons matching screenshot 1 */}
      <div className="flex items-center justify-center gap-6 py-2">
        {/* Пополнить */}
        <button
          type="button"
          onClick={() => {
            haptic('medium');
            setTopupOpen(true);
          }}
          className="flex flex-col items-center group active:scale-95 transition-transform"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-3xl shadow-md group-hover:scale-105 transition-transform">
            👛
          </div>
          <span className="mt-1.5 text-xs font-bold text-[#0f172a]">Пополнить</span>
        </button>

        {/* Установить */}
        <button
          type="button"
          onClick={() => {
            haptic('medium');
            setDeviceModalOpen(true);
          }}
          className="flex flex-col items-center group active:scale-95 transition-transform"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#1e293b] to-[#0f172a] text-3xl shadow-md group-hover:scale-105 transition-transform">
            🖥️
          </div>
          <span className="mt-1.5 text-xs font-bold text-[#0f172a]">Установить</span>
        </button>

        {/* История */}
        <button
          type="button"
          onClick={() => {
            haptic('medium');
            onNavigateTab('history');
          }}
          className="flex flex-col items-center group active:scale-95 transition-transform"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-white to-[#f1f5f9] text-3xl shadow-md group-hover:scale-105 transition-transform border border-white">
            🧾
          </div>
          <span className="mt-1.5 text-xs font-bold text-[#0f172a]">История</span>
        </button>
      </div>

      {/* 3. Notification Banner matching screenshot 1 */}
      <div className="relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-md p-4 shadow-sm border border-white/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌍</span>
            <div>
              <div className="text-xs font-bold text-[#0f172a]">Заполните контактные данные</div>
              <div className="text-[11px] text-[#64748b]">Чтобы не терять нас и получить доступ к личному кабинету на нашем сайте</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <ChevronRight size={16} className="text-[#94a3b8]" />
            <div className="flex gap-1 text-[8px] text-[#94a3b8]">
              <span>●</span>
              <span>○</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Devices section matching screenshot 1 */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-[#0f172a]">Устройства</h3>
          <button
            type="button"
            onClick={() => {
              haptic('medium');
              setDeviceModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#38bdf8] font-bold text-white text-xs shadow-sm hover:bg-[#0284c7] active:scale-95 transition-all"
          >
            <Plus size={14} />
            <span>Добавить</span>
          </button>
        </div>

        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[24px] bg-white/70 backdrop-blur-md p-8 text-center shadow-xs border border-white/60">
            <AlertTriangle size={24} className="text-[#94a3b8] mb-2" />
            <p className="text-xs font-bold text-[#64748b]">Нет подключённых устройств</p>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-white/80 backdrop-blur-md shadow-xs border border-white/60"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f1f5f9] text-[#0f172a]">
                    <Smartphone size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#0f172a]">{d.name || d.deviceModel || 'Устройство'}</div>
                    <div className="text-[10px] text-[#64748b] font-mono">IP: {d.ip || 'Недавно'}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteDevice(d.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModernTopupModal isOpen={topupOpen} onClose={() => setTopupOpen(false)} />
      <ModernDeviceModal isOpen={deviceModalOpen} onClose={() => setDeviceModalOpen(false)} />
    </div>
  );
}
