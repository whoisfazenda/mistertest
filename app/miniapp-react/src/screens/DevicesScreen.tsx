import { motion } from 'framer-motion';
import {
  AlertCircle,
  Apple,
  Check,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  Monitor,
  Phone,
  QrCode,
  Share2,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { GlassCard, StaggerGroup } from '../components/GlassCard';
import { HeroBanner } from '../components/HeroBanner';
import { PullToRefresh } from '../components/PullToRefresh';
import { Screen } from '../components/Screen';
import { CopyLinkModal } from '../components/CopyLinkModal';
import { staggerItem } from '../lib/format';
import { haptic, hapticNotify, openLink, showAlert } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';
import type { FamilySlotsSummary } from '../types';
import * as api from '../api/client';

interface GuideApp {
  name: string;
  badge?: string;
  lead: string;
  downloadUrl: string;
  secondaryDownloadUrl?: string;
  secondaryDownloadLabel?: string;
  steps: string[];
  troubleshoot: string[];
}

const GUIDES: Record<'ios' | 'android' | 'windows' | 'mac', { label: string; icon: any; apps: GuideApp[] }> = {
  ios: {
    label: 'iPhone / iPad',
    icon: Phone,
    apps: [
      {
        name: 'Happ (iOS)',
        badge: 'Официальный выбор',
        lead: 'Удобное приложение Happ Proxy Utility Plus из App Store',
        downloadUrl: 'https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973',
        secondaryDownloadUrl: 'https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973?platform=ipad',
        secondaryDownloadLabel: 'Скачать для iPad',
        steps: [
          'Скачайте и установите приложение Happ из App Store по ссылке ниже.',
          'Скопируйте вашу персональную ссылку подписки (кнопка ниже) или используйте QR-код.',
          'Запустите установленное приложение Happ.',
          'Найдите в верхней части экрана значок «+» (плюс).',
          'Нажмите на него и выберите «Импорт из буфера обмена» (или нажмите кнопку QR-кода и отсканируйте его).',
          'В главном окне появится список серверов. Выберите локацию и нажмите круглую кнопку запуска.',
          'Система спросит разрешение на добавление VPN-конфигурации — нажмите «Разрешить» и подтвердите (Face ID / пароль).',
        ],
        troubleshoot: [
          'Включите любой старый VPN, с которого вы заходили в Telegram: первичное добавление конфигурации у некоторых провайдеров РФ может блокироваться.',
          'После успешного добавления старый VPN можно навсегда отключить и удалить.',
          'Нажмите кнопку синхронизации в приложении (иконка круговых стрелок), чтобы обновить список доступных локаций.',
        ],
      },
    ],
  },
  android: {
    label: 'Android',
    icon: Smartphone,
    apps: [
      {
        name: 'Happ (Android)',
        badge: 'Официальный выбор',
        lead: 'Быстрый и надежный клиент из Google Play',
        downloadUrl: 'https://play.google.com/store/search?q=happ&c=apps&hl=ru',
        steps: [
          'Установите приложение Happ из Google Play по ссылке ниже.',
          'Скопируйте вашу персональную ссылку подписки на главном экране или нажмите «Скопировать ссылку».',
          'Запустите приложение Happ.',
          'Найдите в верхней части экрана значок «+» (плюс).',
          'Нажмите «Импорт из буфера обмена» (или отсканируйте QR-код подписки).',
          'В главном окне появится список доступных серверов.',
          'Нажмите на иконку нужного сервера и нажмите кнопку запуска.',
          'Система запросит разрешение на создание VPN-туннеля — нажмите «Разрешить / Ок».',
        ],
        troubleshoot: [
          'Если подписка не добавляется, включите любой старый VPN перед нажатием «Импорт». После добавления старый VPN можно выключить.',
          'Нажмите на иконку синхронизации (круговые стрелочки), чтобы подтянуть актуальные IP-адреса серверов.',
        ],
      },
    ],
  },
  windows: {
    label: 'Windows',
    icon: Monitor,
    apps: [
      {
        name: 'Happ Desktop (Windows)',
        badge: 'Официальный выбор',
        lead: 'Официальная версия Desktop для Windows x64 с поддержкой System Proxy & TUN',
        downloadUrl: 'https://www.happ.su/main/ru',
        steps: [
          'Скачайте программу Happ на их официальном сайте (версия Desktop для Windows x64).',
          'Установите и запустите программу на компьютере.',
          'Скопируйте вашу персональную ссылку подписки (кнопка внизу).',
          'Найдите в верхней части экрана приложения значок «+» (плюс).',
          'Нажмите на него и выберите «Импорт из буфера обмена».',
          'В главном окне появится список доступных серверов.',
          'Нажмите на сервер, к которому хотите подключиться, и нажмите кнопку запуска.',
        ],
        troubleshoot: [
          'Если ссылка не скачивает сервера, включите старый VPN на время первичного импорта.',
          'Нажмите кнопку синхронизации в приложении (иконка круговых стрелок) для обновления серверов.',
        ],
      },
    ],
  },
  mac: {
    label: 'macOS',
    icon: Laptop,
    apps: [
      {
        name: 'Happ for Mac',
        badge: 'Официальный выбор',
        lead: 'Версия Happ для компьютеров Apple Mac из Mac App Store',
        downloadUrl: 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215?platform=mac',
        steps: [
          'Скачайте из App Store программу Happ по ссылке ниже.',
          'Скопируйте вашу ссылку подписки из Telegram-бота или Mini App.',
          'Запустите установленную программу Happ на Mac.',
          'Найдите в верхней части окна значок «+» (плюс).',
          'Выберите «Импорт из буфера обмена».',
          'В списке выберите локацию сервера и нажмите кнопку запуска.',
          'Подтвердите разрешение на создание системного прокси в macOS.',
        ],
        troubleshoot: [
          'Если провайдер блокирует добавление, активируйте временный VPN для разового скачивания конфигурации.',
          'Используйте кнопку круговых стрелок в шапке программы для обновления списка серверов.',
        ],
      },
    ],
  },
};

export default function DevicesScreen() {
  const user = useAppStore((s) => s.user);
  const isAdmin = Boolean(user?.isAdmin);
  const devices = useAppStore((s) => s.devices);
  const subscription = useAppStore((s) => s.subscription);
  const refresh = useAppStore((s) => s.refresh);

  const [activeTab, setActiveTab] = useState<'guides' | 'devices'>('guides');
  const [guidePlatform, setGuidePlatform] = useState<'ios' | 'android' | 'windows' | 'mac'>('ios');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  // Family Sharing State (Admin only)
  const [familySummary, setFamilySummary] = useState<FamilySlotsSummary | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [slotLabel, setSlotLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<{ label: string; botUrl: string; directUrl: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const loadFamilySlots = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await api.getFamilySlotsSummary();
      setFamilySummary(data);
    } catch (e) {
      console.error('Failed to load family slots', e);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadFamilySlots();
  }, [loadFamilySlots]);

  const onRefreshAll = async () => {
    await refresh();
    if (isAdmin) {
      await loadFamilySlots();
    }
  };

  const subUrl = subscription?.subscriptionUrl || subscription?.publicUrl || '';

  const handleDeleteDevice = async (deviceId: string, deviceName: string) => {
    if (deletingId) return;
    if (!confirm(`Удалить устройство «${deviceName}» и освободить слот?`)) return;

    setDeletingId(deviceId);
    try {
      await api.deleteDevice(deviceId);
      hapticNotify('success');
      showAlert('✅ Устройство успешно удалено. Слот освобождён.');
      await onRefreshAll();
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Не удалось удалить устройство');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Screen>
      <PullToRefresh onRefresh={onRefreshAll}>
        <StaggerGroup className="space-y-4 pt-1">
          {/* Hero Banner */}
          <motion.div variants={staggerItem}>
            <HeroBanner
              imageName="subscriptions.png"
              badge="Официальные инструкции"
              title="Настройка Mister VPN"
              subtitle="Пошаговое подключение на iOS, Android, Windows и macOS"
            />
          </motion.div>

          {/* Section Tab Switcher */}
          <motion.div variants={staggerItem}>
            <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              <button
                onClick={() => {
                  haptic('light');
                  setActiveTab('guides');
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                  activeTab === 'guides'
                    ? 'border border-white/20 bg-white text-black shadow-md'
                    : 'text-txt2 hover:text-white'
                }`}
              >
                <Smartphone size={14} />
                <span>Инструкции</span>
              </button>

              <button
                onClick={() => {
                  haptic('light');
                  setActiveTab('devices');
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                  activeTab === 'devices'
                    ? 'border border-white/20 bg-white text-black shadow-md'
                    : 'text-txt2 hover:text-white'
                }`}
              >
                <Laptop size={14} />
                <span>
                  Устройства ({devices.length}
                  {subscription?.devicesMax ? ` / ${subscription.devicesMax}` : ''})
                </span>
              </button>
            </div>
          </motion.div>

          {/* GUIDES TAB */}
          {activeTab === 'guides' && (
            <>
              {/* Quick Subscription Actions Bar */}
              {subUrl && (
                <motion.div variants={staggerItem}>
                  <GlassCard className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">Ваша персональная ссылка:</span>
                      <span className="font-mono text-[11px] text-zinc-400">Шаг 1</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          haptic('light');
                          setCopyOpen(true);
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white py-2.5 text-xs font-bold text-black hover:bg-zinc-200 active:scale-[0.98]"
                      >
                        <Copy size={14} />
                        <span>Скопировать ссылку</span>
                      </button>

                      <button
                        onClick={() => setQrOpen(true)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-xs font-bold text-white hover:bg-white/[0.12] active:scale-[0.98]"
                      >
                        <QrCode size={14} />
                        <span>Показать QR</span>
                      </button>
                    </div>
                  </GlassCard>
                </motion.div>
              )}

              {/* Platform Selector */}
              <motion.div variants={staggerItem}>
                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {(Object.keys(GUIDES) as Array<keyof typeof GUIDES>).map((key) => {
                    const platform = GUIDES[key];
                    const Icon = platform.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          haptic('light');
                          setGuidePlatform(key);
                        }}
                        className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                          guidePlatform === key
                            ? 'border border-white/30 bg-white text-black shadow-sm'
                            : 'border border-white/10 bg-white/[0.03] text-txt2 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <Icon size={14} />
                        <span>{platform.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>

              {/* Guide Content */}
              {GUIDES[guidePlatform].apps.map((app) => (
                <motion.div key={app.name} variants={staggerItem} className="space-y-3">
                  <GlassCard className="p-4 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] text-white">
                          <Download size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-white text-sm">{app.name}</h4>
                            {app.badge && (
                              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-extrabold uppercase text-white">
                                {app.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-txt2 mt-0.5">{app.lead}</p>
                        </div>
                      </div>
                    </div>

                    {/* Step-by-Step Instructions */}
                    <div className="space-y-2.5 border-t border-white/[0.06] pt-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-txt3">
                        Пошаговое подключение:
                      </span>
                      <div className="space-y-2">
                        {app.steps.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs text-zinc-200">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Download Buttons */}
                    <div className="space-y-2 pt-1">
                      <button
                        onClick={() => openLink(app.downloadUrl)}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white text-black font-bold text-xs shadow-md transition-colors hover:bg-zinc-200 active:scale-[0.98]"
                      >
                        <Download size={14} />
                        <span>Скачать {app.name}</span>
                        <ExternalLink size={13} />
                      </button>

                      {app.secondaryDownloadUrl && (
                        <button
                          onClick={() => openLink(app.secondaryDownloadUrl!)}
                          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] text-white font-semibold text-xs transition-colors hover:bg-white/[0.12] active:scale-[0.98]"
                        >
                          <Download size={14} />
                          <span>{app.secondaryDownloadLabel || 'Скачать альтернативную версию'}</span>
                          <ExternalLink size={13} />
                        </button>
                      )}
                    </div>
                  </GlassCard>

                  {/* Troubleshooting Accordion Box */}
                  <GlassCard className="p-4 space-y-2.5 border-amber-500/20 bg-amber-500/[0.03]">
                    <div className="flex items-center gap-2 text-amber-400">
                      <AlertCircle size={16} />
                      <h5 className="font-bold text-xs uppercase tracking-wider">Не подключается?</h5>
                    </div>
                    <div className="space-y-1.5 text-xs text-zinc-300">
                      {app.troubleshoot.map((t, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-amber-400 font-bold">•</span>
                          <span className="leading-relaxed">{t}</span>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </>
          )}

          {/* DEVICES TAB */}
          {activeTab === 'devices' && (
            <>
              {/* Family Sharing Section (Admin only) */}
              {isAdmin && (
                <motion.div variants={staggerItem} className="space-y-3 pb-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Users size={16} className="text-violet-400" />
                      <h3 className="font-bold text-sm text-white">Семейный доступ</h3>
                      <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-extrabold text-violet-300 border border-violet-500/30">
                        Admin Beta
                      </span>
                    </div>
                    {familySummary && (
                      <span className="text-xs font-medium text-txt2">
                        Свободно: <b className="text-emerald-400">{familySummary.availableSlots}</b> из {familySummary.totalSlots}
                      </span>
                    )}
                  </div>

                  <GlassCard className="p-4 space-y-3.5 border-violet-500/20 bg-gradient-to-b from-violet-950/20 to-black/40">
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      Вы можете выделить отдельный слот своего тарифа для члена семьи или друга (строго на 1 устройство).
                    </p>

                    {/* Slots Summary Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                        <span className="text-[10px] font-semibold text-txt3 uppercase block">Всего</span>
                        <span className="font-bold text-sm text-white">{familySummary?.totalSlots || subscription?.devicesMax || 1}</span>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                        <span className="text-[10px] font-semibold text-txt3 uppercase block">Ваших девайсов</span>
                        <span className="font-bold text-sm text-white">{devices.length}</span>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                        <span className="text-[10px] font-semibold text-txt3 uppercase block">Роздано</span>
                        <span className="font-bold text-sm text-violet-300">{familySummary?.activeSharesCount || 0}</span>
                      </div>
                    </div>

                    {/* Active Shares List */}
                    {familySummary && familySummary.shares.filter((s) => s.status === 'active').length > 0 && (
                      <div className="space-y-2 pt-1 border-t border-white/[0.08]">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-txt3 block">
                          Активные семейные инвайты:
                        </span>
                        {familySummary.shares
                          .filter((s) => s.status === 'active')
                          .map((share) => (
                            <div
                              key={share.id}
                              className="flex items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-black/40 p-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-white truncate">{share.label}</span>
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
                                    share.claimedByUsername ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  }`}>
                                    {share.claimedByUsername ? `@${share.claimedByUsername}` : 'Ожидает'}
                                  </span>
                                </div>
                                <span className="font-mono text-[10px] text-zinc-400 truncate block mt-0.5">
                                  {share.inviteBotUrl}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(share.inviteBotUrl);
                                      hapticNotify('success');
                                      showAlert('Ссылка скопирована!');
                                    } catch {
                                      prompt('Ссылка для шеринга:', share.inviteBotUrl);
                                    }
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.12]"
                                  title="Скопировать ссылку"
                                >
                                  <Copy size={13} />
                                </button>

                                <button
                                  onClick={async () => {
                                    if (!confirm(`Отозвать слот «${share.label}»? Устройство потеряет доступ.`)) return;
                                    try {
                                      setRevokingId(share.id);
                                      await api.revokeFamilySlot(share.id);
                                      hapticNotify('success');
                                      showAlert('Слот отозван!');
                                      await loadFamilySlots();
                                    } catch (e) {
                                      showAlert(e instanceof Error ? e.message : 'Ошибка отзыва слота');
                                    } finally {
                                      setRevokingId(null);
                                    }
                                  }}
                                  disabled={revokingId === share.id}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                  title="Отозвать слот"
                                >
                                  {revokingId === share.id ? (
                                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                                  ) : (
                                    <Trash2 size={13} />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Button to share a slot */}
                    <button
                      onClick={() => {
                        haptic('light');
                        setSlotLabel('');
                        setCreatedInvite(null);
                        setCreateModalOpen(true);
                      }}
                      disabled={familySummary ? familySummary.availableSlots <= 0 : false}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 font-bold text-xs text-white shadow-md transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <UserPlus size={15} />
                      <span>{familySummary && familySummary.availableSlots > 0 ? 'Поделиться свободным слотом' : 'Все слоты заняты'}</span>
                    </button>
                  </GlassCard>
                </motion.div>
              )}

              {/* Subheading for personal devices */}
              {isAdmin && devices.length > 0 && (
                <div className="px-1 pt-2 pb-1">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-txt3">Ваши подключенные устройства:</h4>
                </div>
              )}

              {devices.length > 0 ? (
                devices.map((d) => (
                  <motion.div key={d.id} variants={staggerItem}>
                    <GlassCard className="flex items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white">
                          {d.platform === 'iOS' || d.platform === 'macOS' ? (
                            <Apple size={20} />
                          ) : d.platform === 'Windows' ? (
                            <Monitor size={20} />
                          ) : (
                            <Smartphone size={20} />
                          )}
                        </div>

                        <div className="min-w-0">
                          <h4 className="font-semibold text-white text-sm truncate">
                            {d.name || d.deviceModel || 'Устройство'}
                          </h4>
                          <p className="text-[11px] text-txt2 truncate">
                            {d.deviceOs || d.platform} · IP: {d.ip || '—'}
                          </p>
                          {d.lastSeen && (
                            <p className="text-[10px] text-txt3 mt-0.5">
                              Активность: {d.lastSeen}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteDevice(d.id, d.name || 'Устройство')}
                        disabled={deletingId === d.id}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                        title="Удалить устройство"
                      >
                        {deletingId === d.id ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </GlassCard>
                  </motion.div>
                ))
              ) : (
                <motion.div variants={staggerItem}>
                  <GlassCard className="p-8 text-center">
                    <Laptop size={32} className="mx-auto text-zinc-500 mb-2" />
                    <p className="text-sm font-semibold text-white">
                      Нет подключенных устройств
                    </p>
                    <p className="text-xs text-txt2 mt-1 max-w-xs mx-auto">
                      Импортируйте ссылку в приложение на любом вашем устройстве
                    </p>
                  </GlassCard>
                </motion.div>
              )}
            </>
          )}
        </StaggerGroup>
      </PullToRefresh>

      {/* Create Family Slot BottomSheet */}
      <BottomSheet
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Поделиться слотом"
      >
        <div className="py-3 space-y-4">
          {!createdInvite ? (
            <>
              <p className="text-xs text-txt2 leading-relaxed">
                Выберите или введите имя того, с кем делитесь слотом (например, «Мама», «Друг»):
              </p>

              {/* Quick Tags */}
              <div className="flex flex-wrap gap-1.5">
                {['Мама', 'Папа', 'Вторая половинка', 'Друг', 'Ноутбук', 'Планшет'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      haptic('light');
                      setSlotLabel(tag);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-all ${
                      slotLabel === tag
                        ? 'border-violet-400 bg-violet-500/20 text-white'
                        : 'border-white/10 bg-white/[0.04] text-txt2 hover:bg-white/[0.08]'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={slotLabel}
                onChange={(e) => setSlotLabel(e.target.value)}
                placeholder="Имя получателя (например, Мама)"
                className="w-full h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-400"
              />

              <button
                type="button"
                onClick={async () => {
                  if (creating) return;
                  setCreating(true);
                  try {
                    const res = await api.createFamilySlot(slotLabel.trim() || 'Семейный слот');
                    hapticNotify('success');
                    setCreatedInvite({
                      label: res.label,
                      botUrl: res.inviteBotUrl,
                      directUrl: res.inviteDirectUrl,
                    });
                    await loadFamilySlots();
                  } catch (e) {
                    hapticNotify('error');
                    showAlert(e instanceof Error ? e.message : 'Не удалось создать слот');
                  } finally {
                    setCreating(false);
                  }
                }}
                disabled={creating}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-black font-bold text-xs transition-all hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50"
              >
                {creating ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                ) : (
                  <>
                    <Share2 size={15} />
                    <span>Создать ссылку-приглашение</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="space-y-3.5 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 mx-auto">
                <Check size={24} />
              </div>

              <div>
                <h4 className="font-bold text-white text-sm">Слот «{createdInvite.label}» готов!</h4>
                <p className="text-xs text-txt2 mt-0.5">
                  Отправьте ссылку человеку. Он сможет настроить 1 устройство в Telegram или приложении.
                </p>
              </div>

              <div className="font-mono text-[11px] text-zinc-300 bg-black/50 rounded-xl p-2.5 break-all border border-white/10 select-all text-left">
                {createdInvite.botUrl}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(createdInvite.botUrl);
                      setCopiedLink(true);
                      hapticNotify('success');
                      setTimeout(() => setCopiedLink(false), 2000);
                    } catch {
                      prompt('Скопируйте ссылку:', createdInvite.botUrl);
                    }
                  }}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] text-white font-bold text-xs"
                >
                  {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedLink ? 'Скопировано!' : 'Копировать'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const text = encodeURIComponent(
                      `Привет! Я делюсь с тобой быстрым Mister VPN на 1 устройство.\nПодключись по ссылке:\n${createdInvite.botUrl}`
                    );
                    openLink(`https://t.me/share/url?url=${encodeURIComponent(createdInvite.botUrl)}&text=${text}`);
                  }}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white text-black font-bold text-xs"
                >
                  <Share2 size={14} />
                  <span>В Telegram</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Copy Link Modal with Main & Fallback URLs */}
      <CopyLinkModal
        isOpen={copyOpen}
        onClose={() => setCopyOpen(false)}
      />

      {/* QR Code Modal */}
      <BottomSheet
        isOpen={qrOpen}
        onClose={() => setQrOpen(false)}
        title="QR-код для подключения"
      >
        <div className="flex flex-col items-center py-4 space-y-4 text-center">
          <p className="text-xs text-txt2 max-w-xs">
            Отсканируйте этот QR-код в приложении Happ на вашем телефоне или планшете
          </p>

          <div className="rounded-2xl border border-white/20 bg-white p-4 shadow-2xl">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
                subUrl,
              )}`}
              alt="VPN QR Code"
              className="h-52 w-52 rounded-lg"
            />
          </div>

          <button
            onClick={() => {
              setQrOpen(false);
              setCopyOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/20"
          >
            <Copy size={14} />
            <span>Скопировать ссылку</span>
          </button>
        </div>
      </BottomSheet>
    </Screen>
  );
}
