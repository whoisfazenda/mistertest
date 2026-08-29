import {
  Activity,
  ArrowLeft,
  Crown,
  Edit2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Tag,
  Sliders,
  Users,
  Save,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '../components/BottomSheet';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { Screen } from '../components/Screen';
import { haptic, hapticNotify, showAlert } from '../lib/telegram';
import * as api from '../api/client';
import type { AdminOverview, AdminPlan, AdminPromo, AdminUser, AdminSettings } from '../types';
import { useAppStore } from '../store/useAppStore';

export function AdminScreen() {
  const navigate = useNavigate();
  const refresh = useAppStore((s) => s.refresh);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'users' | 'plans' | 'promos' | 'broadcast'>('overview');

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [promos, setPromos] = useState<AdminPromo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(false);

  // User Actions Modal state
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userActionModal, setUserActionModal] = useState<'balance' | 'grant' | null>(null);
  const [balanceDelta, setBalanceDelta] = useState('100');
  const [grantPlanUuid, setGrantPlanUuid] = useState('');

  // Edit Plan Modal state
  const [editingPlan, setEditingPlan] = useState<AdminPlan | null>(null);
  const [editPlanName, setEditPlanName] = useState('');
  const [editPlanPrice, setEditPlanPrice] = useState('');
  const [editPlanActive, setEditPlanActive] = useState(true);
  const [editPlanStyle, setEditPlanStyle] = useState('primary');
  const [savingPlan, setSavingPlan] = useState(false);

  // Promo Code Creation Modal state
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoType, setNewPromoType] = useState<'fixed_amount' | 'percentage'>('fixed_amount');
  const [newPromoValue, setNewPromoValue] = useState('100');
  const [newPromoUsages, setNewPromoUsages] = useState('');

  // Broadcast state
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastBtnText, setBroadcastBtnText] = useState('');
  const [broadcastBtnUrl, setBroadcastBtnUrl] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const loadData = async () => {
    try {
      const [ov, pl, pr, st] = await Promise.all([
        api.getAdminOverview().catch(() => null),
        api.getAdminPlans().catch(() => []),
        api.getAdminPromos().catch(() => []),
        api.getAdminSettings().catch(() => null),
      ]);
      if (ov) setOverview(ov);
      setPlans(pl);
      setPromos(pr);
      if (st) setSettings(st);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSearchUsers = async () => {
    try {
      const res = await api.getAdminUsers(1, searchQuery);
      setUsers(res.users);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка поиска пользователей');
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      void handleSearchUsers();
    } else if (activeTab === 'plans' && plans.length === 0) {
      void api.getAdminPlans().then((pl) => setPlans(pl));
    }
  }, [activeTab]);

  const handleSyncPlans = async () => {
    setLoadingPlans(true);
    try {
      await api.adminSyncPlans();
      hapticNotify('success');
      showAlert('✅ Тарифы успешно синхронизированы из AdaptGroup!');
      const pl = await api.getAdminPlans();
      setPlans(pl);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка синхронизации тарифов');
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleOpenEditPlan = (p: AdminPlan) => {
    setEditingPlan(p);
    setEditPlanName(p.name);
    setEditPlanPrice(String(p.retailPrice ?? p.purchasePrice ?? 250));
    setEditPlanActive(p.isActive);
    setEditPlanStyle(p.buttonStyle || 'primary');
  };

  const handleSavePlan = async () => {
    if (!editingPlan) return;
    const priceNum = Number(editPlanPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      showAlert('Укажите корректную цену в рублях');
      return;
    }
    setSavingPlan(true);
    try {
      await api.adminEditPlan(editingPlan.planUuid, {
        name: editPlanName.trim() || undefined,
        retailPrice: priceNum,
        isActive: editPlanActive,
        isPublic: editPlanActive,
        buttonStyle: editPlanStyle,
      });
      hapticNotify('success');
      showAlert('✅ Настройки тарифа успешно сохранены!');
      setEditingPlan(null);
      const pl = await api.getAdminPlans();
      setPlans(pl);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка сохранения тарифа');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleUpdateBalance = async () => {
    if (!selectedUser || !balanceDelta) return;
    const delta = Number(balanceDelta);
    if (isNaN(delta)) {
      showAlert('Некорректная сумма');
      return;
    }

    try {
      await api.adminUpdateBalance(selectedUser.id, delta);
      hapticNotify('success');
      showAlert(`Баланс обновлён на ${delta > 0 ? `+${delta}` : delta} ₽`);
      setUserActionModal(null);
      setSelectedUser(null);
      void handleSearchUsers();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка изменения баланса');
    }
  };

  const handleGrantPlan = async () => {
    if (!selectedUser || !grantPlanUuid) {
      showAlert('Выберите тариф для выдачи');
      return;
    }

    try {
      await api.adminGrantPlan(selectedUser.id, grantPlanUuid);
      hapticNotify('success');
      showAlert('✅ Тариф успешно выдан пользователю!');
      setUserActionModal(null);
      setSelectedUser(null);
      void handleSearchUsers();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка выдачи тарифа');
    }
  };

  const handleToggleBlock = async (u: AdminUser) => {
    try {
      await api.adminBlockUser(u.id, !u.isBlocked);
      hapticNotify('success');
      setUsers((prev) =>
        prev.map((item) => (item.id === u.id ? { ...item, isBlocked: !item.isBlocked } : item)),
      );
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка блокировки');
    }
  };

  const handleTogglePlan = async (plan: AdminPlan) => {
    try {
      await api.adminTogglePlanVisibility(plan.planUuid, !plan.isActive);
      hapticNotify('success');
      setPlans((prev) =>
        prev.map((p) => (p.planUuid === plan.planUuid ? { ...p, isActive: !p.isActive } : p)),
      );
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка изменения видимости тарифа');
    }
  };

  const handleCreatePromo = async () => {
    if (!newPromoCode.trim()) {
      showAlert('Укажите код промокода');
      return;
    }
    try {
      await api.adminCreatePromo({
        code: newPromoCode.trim().toUpperCase(),
        discountType: newPromoType,
        discountValue: Number(newPromoValue) || 100,
        maxUsages: Number(newPromoUsages) || undefined,
      });
      hapticNotify('success');
      showAlert('✅ Промокод успешно создан');
      setPromoModalOpen(false);
      setNewPromoCode('');
      const pr = await api.getAdminPromos();
      setPromos(pr);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка создания промокода');
    }
  };

  const handleTogglePromo = async (p: AdminPromo) => {
    try {
      await api.adminTogglePromo(p.code, !p.isActive);
      hapticNotify('success');
      setPromos((prev) =>
        prev.map((item) => (item.code === p.code ? { ...item, isActive: !item.isActive } : item)),
      );
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка переключения промокода');
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastText.trim()) {
      showAlert('Введите текст рассылки');
      return;
    }
    if (!confirm('Вы уверены, что хотите отправить рассылку ВСЕМ пользователям бота?')) return;

    setSendingBroadcast(true);
    try {
      const res = await api.adminSendBroadcast(
        broadcastText.trim(),
        broadcastBtnText.trim() || undefined,
        broadcastBtnUrl.trim() || undefined,
      );
      hapticNotify('success');
      showAlert(`✅ Рассылка завершена! Отправлено: ${res.sent || 0}, Ошибок: ${res.failed || 0}`);
      setBroadcastText('');
      setBroadcastBtnText('');
      setBroadcastBtnUrl('');
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Ошибка отправки рассылки');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleToggleFeature = async (featureKey: keyof AdminSettings) => {
    if (!settings) return;
    haptic('light');
    const updated = { ...settings, [featureKey]: !settings[featureKey] };
    setSettings(updated);
    try {
      await api.updateAdminSettings({ [featureKey]: updated[featureKey] });
      hapticNotify('success');
    } catch (e) {
      setSettings(settings);
      showAlert(e instanceof Error ? e.message : 'Ошибка сохранения настройки');
    }
  };

  const handleSaveThemeStyle = async (style: 'classic' | 'modern') => {
    if (!settings) return;
    haptic('medium');
    const updated = { ...settings, appThemeStyle: style };
    setSettings(updated);
    try {
      await api.updateAdminSettings({ appThemeStyle: style });
      await refresh();
      hapticNotify('success');
      showAlert(`Стиль интерфейса изменен на: ${style === 'modern' ? 'Новый стиль ✨' : 'Классический'}`);
    } catch (e) {
      setSettings(settings);
      showAlert(e instanceof Error ? e.message : 'Ошибка смены стиля');
    }
  };

  const handleSaveGeneralSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const res = await api.updateAdminSettings(settings);
      setSettings(res);
      await refresh();
      hapticNotify('success');
      showAlert('✅ Настройки бота успешно сохранены!');
    } catch (e) {
      hapticNotify('error');
      showAlert(e instanceof Error ? e.message : 'Ошибка сохранения настроек');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <Screen>
      <div className="space-y-4 pt-1">
        {/* Header with Back button */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.08]"
          >
            <ArrowLeft size={16} />
            <span>Назад в профиль</span>
          </button>

          <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white">
            <Crown size={14} />
            <span>Admin Hub</span>
          </div>
        </div>

        {/* Tab Navigation with clean wrap / scroll */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {[
            { key: 'overview', label: 'Аналитика' },
            { key: 'settings', label: '⚙️ Настройки' },
            { key: 'users', label: 'Пользователи' },
            { key: 'plans', label: 'Тарифы' },
            { key: 'promos', label: 'Промокоды' },
            { key: 'broadcast', label: 'Рассылка' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                haptic('light');
                setActiveTab(tab.key as any);
              }}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === tab.key
                  ? 'border border-white/30 bg-white text-black shadow-sm'
                  : 'border border-white/10 bg-white/[0.03] text-txt2 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            {/* 0. UI Theme Style Switcher */}
            <GlassCard className="p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
                <Sliders size={16} className="text-white" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Стиль интерфейса Mini App
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveThemeStyle('classic')}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    (settings?.appThemeStyle || 'classic') === 'classic'
                      ? 'border-white/40 bg-white/10 shadow-lg'
                      : 'border-white/10 bg-white/[0.02] opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>Классический</span>
                    {(settings?.appThemeStyle || 'classic') === 'classic' && (
                      <span className="text-[10px] bg-white text-black px-1.5 py-0.5 rounded font-bold">АКТИВЕН</span>
                    )}
                  </div>
                  <div className="text-[11px] text-txt3 mt-1">Оригинальный Noir дизайн</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveThemeStyle('modern')}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    settings?.appThemeStyle === 'modern'
                      ? 'border-emerald-400/40 bg-emerald-500/10 shadow-lg'
                      : 'border-white/10 bg-white/[0.02] opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>Новый стиль ✨</span>
                    {settings?.appThemeStyle === 'modern' && (
                      <span className="text-[10px] bg-emerald-500 text-black px-1.5 py-0.5 rounded font-bold">АКТИВЕН</span>
                    )}
                  </div>
                  <div className="text-[11px] text-txt3 mt-1">Dashboard & Sidebar стиль</div>
                </button>
              </div>
            </GlassCard>

            {/* 1. Master Feature Toggles */}
            <GlassCard className="p-4 space-y-3.5">
              <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
                <Sliders size={16} className="text-white" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Включение / Выключение функций бота
                </span>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    key: 'featureReferral' as const,
                    title: '👥 Реферальная программа',
                    desc: 'Реферальные ссылки, начисление бонусов и раздел «Рефералы»',
                    active: settings?.featureReferral ?? true,
                  },
                  {
                    key: 'featureTrial' as const,
                    title: '🎁 Бесплатный пробный период',
                    desc: 'Выдача бесплатной тестовой подписки для новых пользователей',
                    active: settings?.featureTrial ?? true,
                  },
                  {
                    key: 'featureTopup' as const,
                    title: '💳 Пополнение баланса',
                    desc: 'Возможность пополнять баланс через СБП, Карты и Крипту',
                    active: settings?.featureTopup ?? true,
                  },
                  {
                    key: 'featurePromos' as const,
                    title: '🎟️ Промокоды и купоны',
                    desc: 'Активация подарочных и скидочных промокодов',
                    active: settings?.featurePromos ?? true,
                  },
                  {
                    key: 'featureGifts' as const,
                    title: '🎁 Подарки подписок (Gifts)',
                    desc: 'Возможность дарить подписку другому пользователю',
                    active: settings?.featureGifts ?? true,
                  },
                  {
                    key: 'featureSupport' as const,
                    title: '💬 Тикеты техподдержки',
                    desc: 'Прием обращений в поддержку прямо через приложение',
                    active: settings?.featureSupport ?? true,
                  },
                  {
                    key: 'featureMaintenance' as const,
                    title: '🛠️ Режим техработ (Maintenance)',
                    desc: 'Блокирует доступ обычным пользователям с предупреждением',
                    active: settings?.featureMaintenance ?? false,
                    danger: true,
                  },
                ].map((feat) => (
                  <div
                    key={feat.key}
                    onClick={() => handleToggleFeature(feat.key)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                      feat.danger && feat.active
                        ? 'border-amber-500/40 bg-amber-500/10'
                        : feat.active
                          ? 'border-white/20 bg-white/[0.05]'
                          : 'border-white/5 bg-white/[0.01] opacity-60'
                    }`}
                  >
                    <div className="space-y-0.5 pr-3">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{feat.title}</span>
                        {feat.danger && feat.active && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">АКТИВНО</span>
                        )}
                      </div>
                      <div className="text-[11px] text-txt2 leading-snug">{feat.desc}</div>
                    </div>

                    <div
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                        feat.danger && feat.active
                          ? 'bg-amber-500'
                          : feat.active
                            ? 'bg-emerald-500'
                            : 'bg-zinc-800'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          feat.active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* 2. General Brand & Service Info */}
            <GlassCard className="p-4 space-y-3.5">
              <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
                <Crown size={16} className="text-white" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Название и Ссылки
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-txt3">
                    Название сервиса / бота
                  </label>
                  <input
                    type="text"
                    value={settings?.appName || ''}
                    onChange={(e) => setSettings((s) => s ? { ...s, appName: e.target.value } : null)}
                    placeholder="Mister VPN"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs font-bold text-white focus:outline-none focus:border-white/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-txt3">
                      Ссылка на поддержку
                    </label>
                    <input
                      type="text"
                      value={settings?.supportUrl || ''}
                      onChange={(e) => setSettings((s) => s ? { ...s, supportUrl: e.target.value } : null)}
                      placeholder="https://t.me/support_bot"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-txt3">
                      Ссылка на канал
                    </label>
                    <input
                      type="text"
                      value={settings?.channelUrl || ''}
                      onChange={(e) => setSettings((s) => s ? { ...s, channelUrl: e.target.value } : null)}
                      placeholder="https://t.me/channel"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-txt3">
                      Валюта
                    </label>
                    <input
                      type="text"
                      value={settings?.currency || 'RUB'}
                      onChange={(e) => setSettings((s) => s ? { ...s, currency: e.target.value } : null)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-txt3">
                      Мин. пополнение (₽)
                    </label>
                    <input
                      type="number"
                      value={settings?.minTopup ?? 50}
                      onChange={(e) => setSettings((s) => s ? { ...s, minTopup: Number(e.target.value) } : null)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-txt3">
                      Макс. пополнение (₽)
                    </label>
                    <input
                      type="number"
                      value={settings?.maxTopup ?? 10000}
                      onChange={(e) => setSettings((s) => s ? { ...s, maxTopup: Number(e.target.value) } : null)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* 3. Referral Settings */}
            <GlassCard className="p-4 space-y-3.5">
              <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
                <Users size={16} className="text-white" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Настройки рефералов
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-txt3">
                    Бонус за друга (₽)
                  </label>
                  <input
                    type="number"
                    value={settings?.referralBonusRub ?? 50}
                    onChange={(e) => setSettings((s) => s ? { ...s, referralBonusRub: Number(e.target.value) } : null)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-txt3">
                    Процент от покупок (%)
                  </label>
                  <input
                    type="number"
                    value={settings?.referralRewardPercent ?? 15}
                    onChange={(e) => setSettings((s) => s ? { ...s, referralRewardPercent: Number(e.target.value) } : null)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                  />
                </div>
              </div>
            </GlassCard>

            {/* Save Button */}
            <GradientButton onClick={handleSaveGeneralSettings} loading={savingSettings}>
              <Save size={16} />
              <span>Сохранить настройки</span>
            </GradientButton>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <GlassCard className="p-4">
                <span className="text-[11px] font-semibold uppercase text-txt3">Пользователи</span>
                <p className="font-mono text-2xl font-bold text-white mt-1">
                  {overview?.totalUsers || 0}
                </p>
                <p className="text-[11px] text-emerald-400 mt-1 font-medium">
                  +{overview?.newUsers24h || 0} сегодня
                </p>
              </GlassCard>

              <GlassCard className="p-4">
                <span className="text-[11px] font-semibold uppercase text-txt3">Активные подписки</span>
                <p className="font-mono text-2xl font-bold text-white mt-1">
                  {overview?.activeSubscriptions || 0}
                </p>
                <p className="text-[11px] text-amber-400 mt-1 font-medium">
                  {overview?.expiring7d || 0} истекают за 7 дн.
                </p>
              </GlassCard>

              <GlassCard className="p-4">
                <span className="text-[11px] font-semibold uppercase text-txt3">Выручка сегодня</span>
                <p className="font-mono text-2xl font-bold text-white mt-1">
                  {overview?.revenueToday || 0} ₽
                </p>
                <p className="text-[11px] text-txt3 mt-1 font-medium">
                  За 30 дн: {overview?.revenueMonth || 0} ₽
                </p>
              </GlassCard>

              <GlassCard className="p-4">
                <span className="text-[11px] font-semibold uppercase text-txt3">Заказы</span>
                <p className="font-mono text-2xl font-bold text-white mt-1">
                  {overview?.ordersCount || 0}
                </p>
                <p className="text-[11px] text-txt3 mt-1 font-medium">
                  {overview?.paidOrders30d || 0} оплачено
                </p>
              </GlassCard>
            </div>

            {/* AdaptGroup Status */}
            <GlassCard className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={18} className="text-white" />
                  <h4 className="font-bold text-white text-sm">Статус AdaptGroup API</h4>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                    overview?.adaptgroupOnline
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}
                >
                  {overview?.adaptgroupOnline ? 'Онлайн' : 'Офлайн'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-txt2 pt-1 border-t border-white/[0.06]">
                <span>Задержка ответа:</span>
                <span className="font-mono font-bold text-white">
                  {overview?.adaptgroupLatency != null ? `${overview.adaptgroupLatency} ms` : '—'}
                </span>
              </div>
            </GlassCard>
          </div>
        )}

        {/* TAB 2: USERS */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Поиск по ID или username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchUsers()}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 pl-9 text-xs text-white placeholder-zinc-600 focus:border-white/30 focus:outline-none"
                />
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              </div>
              <button
                onClick={handleSearchUsers}
                className="rounded-xl border border-white/20 bg-white px-4 text-xs font-bold text-black"
              >
                Найти
              </button>
            </div>

            <div className="space-y-2">
              {users.length === 0 && (
                <div className="text-center py-8 text-xs text-txt3">Пользователи не найдены</div>
              )}

              {users.map((u) => (
                <GlassCard key={u.id} className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-sm">{u.firstName || 'Без имени'}</span>
                        {u.hasActiveSubscription && (
                          <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400">
                            VPN
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-txt2">
                        {u.username ? `@${u.username}` : `ID: ${u.telegramId}`}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-txt3 uppercase">Баланс</span>
                      <p className="font-mono text-sm font-bold text-white">{u.balance} ₽</p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1 border-t border-white/[0.06]">
                    <button
                      onClick={() => {
                        setSelectedUser(u);
                        setBalanceDelta('100');
                        setUserActionModal('balance');
                      }}
                      className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.08]"
                    >
                      Баланс ±
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser(u);
                        setGrantPlanUuid(plans[0]?.planUuid || '');
                        setUserActionModal('grant');
                      }}
                      className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.08]"
                    >
                      Выдать VPN
                    </button>
                    <button
                      onClick={() => handleToggleBlock(u)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                        u.isBlocked
                          ? 'border border-white/20 bg-white text-black'
                          : 'border border-red-500/20 bg-red-500/10 text-red-300'
                      }`}
                    >
                      {u.isBlocked ? 'Разбан' : 'Бан'}
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: PLANS */}
        {activeTab === 'plans' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-txt3">Управление тарифами ({plans.length})</span>
              <button
                onClick={handleSyncPlans}
                disabled={loadingPlans}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.1]"
              >
                <RefreshCw size={13} className={loadingPlans ? 'animate-spin' : ''} />
                <span>Синхронизировать</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {plans.length === 0 && (
                <div className="text-center py-8 text-xs text-txt3">
                  Тарифы не загружены. Нажмите «Синхронизировать».
                </div>
              )}

              {plans.map((p) => (
                <GlassCard key={p.planUuid} className="space-y-2.5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">{p.name}</h4>
                        {!p.isActive && (
                          <span className="rounded-full bg-zinc-800 px-1.5 py-0.2 text-[9px] font-bold text-zinc-400">
                            СКРЫТ
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-txt2 mt-0.5">
                        {p.durationDays} дн. · до {p.maxDevices} устр. · <b className="text-white">{p.retailPrice || 0} ₽</b>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditPlan(p)}
                        className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/[0.12]"
                      >
                        <Edit2 size={12} />
                        <span>Изменить</span>
                      </button>

                      <button
                        onClick={() => handleTogglePlan(p)}
                        className={`rounded-xl px-2.5 py-1.5 text-xs font-bold ${
                          p.isActive
                            ? 'border border-white/20 bg-white/10 text-white'
                            : 'border border-zinc-700 bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {p.isActive ? 'Вкл' : 'Выкл'}
                      </button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: PROMOS */}
        {activeTab === 'promos' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-txt3">Список промокодов ({promos.length})</span>
              <button
                onClick={() => setPromoModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white px-3 py-1.5 text-xs font-bold text-black"
              >
                <Plus size={14} />
                <span>Создать промокод</span>
              </button>
            </div>

            <div className="space-y-2">
              {promos.length === 0 && (
                <div className="text-center py-8 text-xs text-txt3">Промокодов пока нет</div>
              )}

              {promos.map((p) => (
                <GlassCard key={p.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
                      <Tag size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white">{p.code}</span>
                        {!p.isActive && (
                          <span className="rounded-full bg-zinc-800 px-1.5 py-0.2 text-[9px] font-bold text-zinc-400">
                            НЕАКТИВЕН
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-txt2">
                        Скидка: {p.discountValue}
                        {p.discountType === 'percentage' ? '%' : ' ₽'} · Использован: {p.usedCount}
                        {p.maxUsages ? `/${p.maxUsages}` : ''}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleTogglePromo(p)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                      p.isActive
                        ? 'border border-white/20 bg-white/10 text-white'
                        : 'border border-zinc-700 bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {p.isActive ? 'Вкл' : 'Выкл'}
                  </button>
                </GlassCard>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: BROADCAST */}
        {activeTab === 'broadcast' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-txt3">Текст сообщения</label>
              <textarea
                rows={5}
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="🔥 Специальное предложение для пользователей Mister VPN!..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-white placeholder-zinc-600 focus:border-white/30 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-txt2 font-medium">Текст кнопки (опция)</label>
                <input
                  type="text"
                  placeholder="Открыть тарифы"
                  value={broadcastBtnText}
                  onChange={(e) => setBroadcastBtnText(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-txt2 font-medium">URL кнопки (опция)</label>
                <input
                  type="text"
                  placeholder="https://t.me/..."
                  value={broadcastBtnUrl}
                  onChange={(e) => setBroadcastBtnUrl(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white"
                />
              </div>
            </div>

            <GradientButton onClick={handleSendBroadcast} loading={sendingBroadcast}>
              <Send size={16} />
              <span>Отправить всем пользователям</span>
            </GradientButton>
          </div>
        )}
      </div>

      {/* Edit Plan Modal */}
      <BottomSheet
        isOpen={Boolean(editingPlan)}
        onClose={() => setEditingPlan(null)}
        title="Редактирование тарифа"
      >
        <div className="space-y-3.5 py-2">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-txt3">
              Название тарифа
            </label>
            <input
              type="text"
              value={editPlanName}
              onChange={(e) => setEditPlanName(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/[0.04] p-3 text-sm font-bold text-white focus:outline-none focus:border-white/35"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-txt3">
              Розничная цена (₽)
            </label>
            <input
              type="number"
              value={editPlanPrice}
              onChange={(e) => setEditPlanPrice(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/[0.04] p-3 font-mono text-lg font-bold text-white focus:outline-none focus:border-white/35"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-txt3">
              Стиль кнопки в боте
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'primary', label: '🔵 Синяя' },
                { key: 'success', label: '🟢 Зелёная' },
                { key: 'danger', label: '🔴 Красная' },
              ].map((st) => (
                <button
                  key={st.key}
                  onClick={() => setEditPlanStyle(st.key)}
                  className={`rounded-xl border p-2 text-xs font-semibold ${
                    editPlanStyle === st.key
                      ? 'border-white/40 bg-white text-black'
                      : 'border-white/10 bg-white/[0.03] text-txt2'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-white/[0.06]">
            <span className="text-xs font-semibold text-white">Отображать в приложении</span>
            <button
              onClick={() => setEditPlanActive(!editPlanActive)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                editPlanActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}
            >
              {editPlanActive ? 'Включен' : 'Скрыт'}
            </button>
          </div>

          <GradientButton onClick={handleSavePlan} loading={savingPlan}>
            Сохранить изменения
          </GradientButton>
        </div>
      </BottomSheet>

      {/* User Balance Adjustment Sheet */}
      <BottomSheet
        isOpen={Boolean(selectedUser && userActionModal === 'balance')}
        onClose={() => {
          setSelectedUser(null);
          setUserActionModal(null);
        }}
        title={`Баланс @${selectedUser?.username || selectedUser?.telegramId}`}
      >
        <div className="space-y-4 py-2">
          <p className="text-xs text-txt2">
            Текущий баланс: <b className="text-white">{selectedUser?.balance} ₽</b>
          </p>
          <input
            type="number"
            value={balanceDelta}
            onChange={(e) => setBalanceDelta(e.target.value)}
            placeholder="Сумма изменения (+100 или -50)"
            className="w-full rounded-xl border border-white/15 bg-white/[0.04] p-3 font-mono text-lg font-bold text-white focus:outline-none"
          />
          <GradientButton onClick={handleUpdateBalance}>
            Применить изменение
          </GradientButton>
        </div>
      </BottomSheet>

      {/* Grant Plan Sheet */}
      <BottomSheet
        isOpen={Boolean(selectedUser && userActionModal === 'grant')}
        onClose={() => {
          setSelectedUser(null);
          setUserActionModal(null);
        }}
        title="Бесплатная выдача тарифа"
      >
        <div className="space-y-4 py-2">
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {plans.length === 0 && (
              <div className="text-center py-4 text-xs text-txt3">Загрузка тарифов...</div>
            )}
            {plans.map((p) => (
              <button
                key={p.planUuid}
                onClick={() => setGrantPlanUuid(p.planUuid)}
                className={`w-full rounded-xl border p-3 text-left transition-all ${
                  grantPlanUuid === p.planUuid
                    ? 'border-white/40 bg-white/10 text-white shadow-sm'
                    : 'border-white/10 bg-white/[0.02] text-txt2 hover:bg-white/[0.05]'
                }`}
              >
                <div className="text-xs font-bold text-white">{p.name}</div>
                <div className="text-[10px] text-txt2">{p.durationDays} дней · {p.maxDevices} устройств</div>
              </button>
            ))}
          </div>

          <GradientButton onClick={handleGrantPlan}>
            Выдать выбранный тариф
          </GradientButton>
        </div>
      </BottomSheet>

      {/* Create Promo Modal */}
      <BottomSheet
        isOpen={promoModalOpen}
        onClose={() => setPromoModalOpen(false)}
        title="Новый промокод"
      >
        <div className="space-y-3.5 py-2">
          <input
            type="text"
            placeholder="КОД (например: SPECIAL2026)"
            value={newPromoCode}
            onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-white/15 bg-white/[0.04] p-3 font-mono text-sm font-bold uppercase text-white"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setNewPromoType('fixed_amount')}
              className={`rounded-xl border p-2.5 text-xs font-semibold ${
                newPromoType === 'fixed_amount'
                  ? 'border-white/30 bg-white text-black'
                  : 'border-white/10 bg-white/[0.03] text-txt2'
              }`}
            >
              Фикс сумма (₽)
            </button>
            <button
              onClick={() => setNewPromoType('percentage')}
              className={`rounded-xl border p-2.5 text-xs font-semibold ${
                newPromoType === 'percentage'
                  ? 'border-white/30 bg-white text-black'
                  : 'border-white/10 bg-white/[0.03] text-txt2'
              }`}
            >
              Процент (%)
            </button>
          </div>

          <input
            type="number"
            placeholder="Значение скидки / баланса"
            value={newPromoValue}
            onChange={(e) => setNewPromoValue(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-white"
          />

          <input
            type="number"
            placeholder="Максимум активаций (например: 100)"
            value={newPromoUsages}
            onChange={(e) => setNewPromoUsages(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-white"
          />

          <GradientButton onClick={handleCreatePromo}>
            Создать промокод
          </GradientButton>
        </div>
      </BottomSheet>
    </Screen>
  );
}

export default AdminScreen;
