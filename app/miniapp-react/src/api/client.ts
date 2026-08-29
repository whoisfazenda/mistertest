import type {
  AdminOverview,
  AdminPlan,
  AdminPromo,
  AdminUser,
  AdminSettings,
  ConnectionLog,
  Device,
  Order,
  Plan,
  ReferralInfo,
  Subscription,
  User,
} from '../types';

export type {
  AdminOverview,
  AdminPlan,
  AdminPromo,
  AdminUser,
  AdminSettings,
  ConnectionLog,
  Device,
  Order,
  Plan,
  ReferralInfo,
  Subscription,
  User,
};

import { tg } from '../lib/telegram';

export type PaymentMethod =
  | 'balance'
  | 'card'
  | 'sbp'
  | 'crypto'
  | 'xrocket'
  | 'cryptobot';

export interface TrialOffer {
  planUuid: string;
  name: string;
  days: number;
  maxDevices: number | null;
}

export interface AppConfig {
  appName: string;
  supportUrl: string;
  channelUrl: string;
  currency: string;
  minTopup: number;
  maxTopup: number;
  trafficPricePerGb: number;
  serverSelectionSupported: boolean;
  serverMode: string;
  appThemeStyle?: 'classic' | 'modern';
  featureReferral?: boolean;
  featureTrial?: boolean;
  featureTopup?: boolean;
  featurePromos?: boolean;
  featureGifts?: boolean;
  featureSupport?: boolean;
  featureMaintenance?: boolean;
}

export interface BootstrapData {
  user: User;
  subscription: Subscription | null;
  devices: Device[];
  plans: Plan[];
  orders: Order[];
  trial: TrialOffer | null;
  config: AppConfig;
}

export interface PaymentResult {
  ok: boolean;
  completed: boolean;
  needsTopup: boolean;
  orderUuid?: string;
  amount?: number;
  confirmationUrl?: string;
  message?: string;
}

function initData(): string {
  return String((tg as { initData?: string }).initData ?? '');
}

function errorMessage(payload: unknown, status: number): string {
  const detail = (payload as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === 'object') {
    const first = detail[0] as { msg?: string };
    if (first.msg) return first.msg;
  }
  if (status === 401) return 'Откройте Mini App из Telegram';
  return `Ошибка API (${status})`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  headers.set('ngrok-skip-browser-warning', '1');
  const data = initData();
  if (data) headers.set('X-Telegram-Init-Data', data);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload as T;
}

const time = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const platform = (value: unknown): Device['platform'] => {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('ios') || text.includes('iphone') || text.includes('ipad')) return 'iOS';
  if (text.includes('android')) return 'Android';
  if (text.includes('win')) return 'Windows';
  if (text.includes('mac')) return 'macOS';
  if (text.includes('linux')) return 'Linux';
  return 'Other';
};

function deviceWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'устройство';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'устройства';
  return 'устройств';
}

function planFeatures(item: {
  max_devices?: number;
  duration_days?: number;
  traffic_limit_bytes?: number | null;
}): string[] {
  const devices = item.max_devices ?? 1;
  const days = item.duration_days ?? 30;
  const traffic = item.traffic_limit_bytes;
  const features = [
    `${devices} ${deviceWord(devices)}`,
    `${days} дн.`,
  ];
  if (traffic && traffic > 0) {
    features.push(`${(traffic / 1e9).toFixed(0)} ГБ трафика`);
  } else {
    features.push('Безлимитный трафик');
  }
  features.push('Быстрое подключение VLESS');
  return features;
}

function normalizeOrder(raw: Record<string, unknown>): Order {
  const snapshot = (raw.snapshot as Record<string, unknown> | null) ?? {};
  return {
    uuid: String(raw.uuid ?? ''),
    type: String(raw.type ?? ''),
    status: String(raw.status ?? ''),
    amount: Number(raw.amount ?? 0),
    currency: String(raw.currency ?? 'RUB'),
    paymentProvider: raw.payment_provider ? String(raw.payment_provider) : undefined,
    createdAt: time(raw.created_at),
    planName: snapshot.plan_name ? String(snapshot.plan_name) : undefined,
    paymentMethod: snapshot.payment_method ? String(snapshot.payment_method) : undefined,
  };
}

function normalizePayment(raw: Record<string, unknown>): PaymentResult {
  return {
    ok: Boolean(raw.ok),
    completed: Boolean(raw.completed),
    needsTopup: Boolean(raw.needs_topup),
    orderUuid: raw.order_uuid ? String(raw.order_uuid) : undefined,
    amount: raw.amount != null ? Number(raw.amount) : undefined,
    confirmationUrl: raw.confirmation_url ? String(raw.confirmation_url) : undefined,
    message: raw.message ? String(raw.message) : undefined,
  };
}

function normalize(raw: Record<string, any>): BootstrapData {
  const sub = raw.subscription;
  return {
    user: {
      id: raw.user.id,
      telegramId: raw.user.telegram_id,
      firstName: raw.user.first_name ?? 'Пользователь',
      username: raw.user.username ?? undefined,
      balance: Number(raw.user.balance ?? 0),
      hasSubscription: Boolean(sub),
      currency: raw.user.currency ?? 'RUB',
      isAdmin: Boolean(raw.user.is_admin),
      trialClaimed: Boolean(raw.user.trial_claimed),
      referrerId: raw.user.referrer_id,
      referralEarned: Number(raw.user.referral_earned ?? 0),
    },
    subscription: sub
      ? {
          planName: sub.plan_name || 'Mister VPN',
          devicesUsed: sub.device_count ?? (Array.isArray(raw.devices) ? raw.devices.length : 0),
          devicesMax: sub.max_devices ?? 0,
          renewsAt: time(sub.expires_at),
          trafficUsedGb: (sub.traffic_used_bytes ?? 0) / 1e9,
          trafficLimitGb: sub.traffic_limit_bytes ? sub.traffic_limit_bytes / 1e9 : 0,
          trafficUsedBytes: sub.traffic_used_bytes ?? 0,
          trafficLimitBytes: sub.traffic_limit_bytes,
          uuid: sub.uuid,
          planUuid: sub.plan_uuid,
          isFrozen: Boolean(sub.is_frozen),
          isTrial: Boolean(sub.is_trial),
          isExpired: Boolean(sub.is_expired),
          isActive: Boolean(sub.is_active),
          daysLeft: sub.days_left ?? null,
          autoRenewEnabled: Boolean(sub.auto_renew_enabled),
          subscriptionUrl: sub.subscription_url,
          publicUrl: sub.public_url || sub.subscription_url,
          directUrl: sub.direct_url,
        }
      : null,
    devices: (raw.devices ?? []).map((item: Record<string, unknown>) => ({
      id: String(item.id ?? item.device_id ?? ''),
      name: String(item.name ?? item.device_model ?? 'Устройство'),
      platform: platform(item.os ?? item.device_os ?? item.model),
      lastActiveAt: time(item.last_seen ?? item.updated_at),
      lastSeen: item.last_seen ? String(item.last_seen) : undefined,
      hwid: item.hwid ? String(item.hwid) : undefined,
      ip: item.ip ? String(item.ip) : (item.ip_address ? String(item.ip_address) : undefined),
      deviceModel: item.device_model ? String(item.device_model) : undefined,
      deviceOs: item.device_os ? String(item.device_os) : undefined,
    })),
    plans: (raw.plans ?? []).map((item: Record<string, any>) => ({
      id: String(item.uuid),
      uuid: String(item.uuid),
      name: String(item.name),
      devices: item.max_devices ?? 1,
      monthlyPrice: Number(item.price ?? 0),
      price: Number(item.price ?? 0),
      durationDays: item.duration_days ?? 30,
      periodGroup: item.period_group,
      popular: item.button_style === 'success' || Boolean(item.popular),
      buttonStyle: item.button_style,
      isTrial: Boolean(item.is_trial),
      trafficLimitBytes: item.traffic_limit_bytes,
      features: planFeatures(item),
    })),
    orders: (raw.orders ?? []).map((item: Record<string, unknown>) => normalizeOrder(item)),
    trial: raw.trial
      ? {
          planUuid: raw.trial.plan_uuid,
          name: raw.trial.name,
          days: raw.trial.days,
          maxDevices: raw.trial.max_devices,
        }
      : null,
    config: {
      appName: raw.config?.app_name ?? 'Mister VPN',
      supportUrl: raw.config?.support_url ?? 'https://t.me/misterfvpn_bot',
      channelUrl: raw.config?.channel_url ?? 'https://t.me/misterfvpn_channel',
      currency: raw.config?.currency ?? 'RUB',
      minTopup: Number(raw.config?.min_topup ?? 100),
      maxTopup: Number(raw.config?.max_topup ?? 50000),
      trafficPricePerGb: Number(raw.config?.traffic_price_per_gb ?? 3),
      serverSelectionSupported: Boolean(raw.config?.server_selection_supported),
      serverMode: raw.config?.server_mode ?? 'automatic',
      appThemeStyle: (raw.config?.app_theme_style === 'modern' ? 'modern' : 'classic'),
      featureReferral: Boolean(raw.config?.feature_referral ?? true),
      featureTrial: Boolean(raw.config?.feature_trial ?? true),
      featureTopup: Boolean(raw.config?.feature_topup ?? true),
      featurePromos: Boolean(raw.config?.feature_promos ?? true),
      featureGifts: Boolean(raw.config?.feature_gifts ?? true),
      featureSupport: Boolean(raw.config?.feature_support ?? true),
      featureMaintenance: Boolean(raw.config?.feature_maintenance ?? false),
    },
  };
}

export async function getBootstrap(): Promise<BootstrapData> {
  return normalize(await request('/miniapp/api/bootstrap'));
}

export async function purchasePlan(
  planUuid: string,
  paymentMethod: PaymentMethod = 'balance',
): Promise<PaymentResult> {
  return normalizePayment(
    await request('/miniapp/api/orders/purchase', {
      method: 'POST',
      body: JSON.stringify({ plan_uuid: planUuid, payment_method: paymentMethod }),
    }),
  );
}

export async function purchaseGift(
  planUuid: string,
  recipient: string,
  paymentMethod: PaymentMethod = 'balance',
): Promise<PaymentResult> {
  return normalizePayment(
    await request('/miniapp/api/orders/gift', {
      method: 'POST',
      body: JSON.stringify({ plan_uuid: planUuid, recipient, payment_method: paymentMethod }),
    }),
  );
}

export async function renewSubscription(
  paymentMethod: PaymentMethod = 'balance',
): Promise<PaymentResult> {
  return normalizePayment(
    await request('/miniapp/api/orders/renew', {
      method: 'POST',
      body: JSON.stringify({ payment_method: paymentMethod }),
    }),
  );
}

export async function renewCustom(
  days: number,
  paymentMethod: PaymentMethod = 'balance',
): Promise<PaymentResult> {
  return normalizePayment(
    await request('/miniapp/api/orders/renew/custom', {
      method: 'POST',
      body: JSON.stringify({ days, payment_method: paymentMethod }),
    }),
  );
}

export async function topUp(
  amount: number,
  paymentMethod: Exclude<PaymentMethod, 'balance'> = 'card',
): Promise<PaymentResult> {
  return normalizePayment(
    await request('/miniapp/api/orders/topup', {
      method: 'POST',
      body: JSON.stringify({ amount, payment_method: paymentMethod }),
    }),
  );
}

export async function deleteDevice(deviceId: string): Promise<void> {
  await request(`/miniapp/api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
  });
}

export async function getConnections(
  filter: 'all' | 'success' | 'error' = 'all',
): Promise<ConnectionLog[]> {
  const raw = await request<{ items: Record<string, unknown>[] }>(
    '/miniapp/api/connections',
  );
  return (raw.items ?? [])
    .filter((item) => {
      const ok = Boolean(item.success);
      if (filter === 'success') return ok;
      if (filter === 'error') return !ok;
      return true;
    })
    .map((item) => ({
      id: String(item.id ?? crypto.randomUUID()),
      device: String(item.device ?? 'Устройство'),
      ip: String(item.ip ?? '—'),
      location: String(item.country ?? '—'),
      timestamp: time(item.created_at),
      status: item.success ? 'success' : 'error',
    }));
}

export async function freezeSubscription(enabled: boolean): Promise<void> {
  await request('/miniapp/api/subscription/freeze', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function toggleAutoRenew(enabled: boolean): Promise<void> {
  await request('/miniapp/api/subscription/auto-renew', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function claimTrial(): Promise<void> {
  await request('/miniapp/api/trial/claim', { method: 'POST' });
}

export async function createSupportTicket(message: string): Promise<void> {
  await request('/miniapp/api/support/tickets', {
    method: 'POST',
    body: JSON.stringify({ message, category: 'other' }),
  });
}

export async function redeemPromo(code: string): Promise<{ balance: number; message?: string }> {
  return request('/miniapp/api/promo', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function checkOrder(orderUuid: string): Promise<PaymentResult> {
  return normalizePayment(
    await request(`/miniapp/api/orders/${encodeURIComponent(orderUuid)}/check`, {
      method: 'POST',
    }),
  );
}

export async function getReferral(): Promise<ReferralInfo> {
  const raw = await request<Record<string, unknown>>('/miniapp/api/referral');
  return {
    link: String(raw.link ?? ''),
    invited: Number(raw.invited ?? 0),
    earned: Number(raw.earned ?? 0),
    bonus: Number(raw.bonus ?? 0),
    currency: String(raw.currency ?? 'RUB'),
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const raw = await request<Record<string, any>>('/miniapp/api/admin/overview');
  const metrics = raw.metrics ?? {};
  const pulse = raw.pulse ?? {};
  return {
    totalUsers: Number(metrics.users ?? 0),
    newUsers24h: Number(metrics.new_users_24h ?? 0),
    activeSubscriptions: Number(metrics.active_subscriptions ?? 0),
    expiring7d: Number(metrics.expiring_7d ?? 0),
    ordersCount: Number(metrics.orders ?? 0),
    pendingOrders: Number(metrics.pending_orders ?? 0),
    revenueToday: Number(metrics.revenue_24h ?? 0),
    revenueMonth: Number(metrics.revenue_30d ?? 0),
    paidOrders30d: Number(metrics.paid_orders_30d ?? 0),
    activePromos: Number(metrics.active_promos ?? 0),
    adaptgroupOnline: Boolean(pulse.online ?? true),
    adaptgroupLatency: pulse.latency_ms ? Number(pulse.latency_ms) : undefined,
    adaptgroupMessage: pulse.message ? String(pulse.message) : undefined,
    adaptgroupBalance: raw.adaptgroup_balance != null ? Number(raw.adaptgroup_balance) : null,
    adaptgroupCurrency: raw.adaptgroup_currency ? String(raw.adaptgroup_currency) : 'USD',
  };
}

export async function getAdminUsers(page: number = 1, search: string = ''): Promise<{ users: AdminUser[]; total: number }> {
  const query = new URLSearchParams({
    q: search.trim(),
    limit: '40',
    offset: String((page - 1) * 40),
  });
  const raw = await request<Record<string, any>>(`/miniapp/api/admin/users?${query.toString()}`);
  const list = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.users) ? raw.users : [];
  return {
    total: Number(raw.total ?? list.length),
    users: list.map((u: any) => ({
      id: Number(u.id),
      telegramId: Number(u.telegram_id),
      username: u.username,
      firstName: u.first_name,
      balance: Number(u.balance ?? 0),
      balanceCurrency: u.balance_currency ?? 'RUB',
      isBlocked: Boolean(u.is_blocked),
      hasActiveSubscription: Boolean(u.has_active_subscription ?? (u.subscription && u.subscription.is_active)),
      trialClaimed: Boolean(u.trial_claimed),
      createdAt: String(u.created_at ?? ''),
      lastActivityAt: u.last_activity_at ? String(u.last_activity_at) : undefined,
      adminNote: u.admin_note,
      adminTags: Array.isArray(u.admin_tags) ? u.admin_tags : [],
    })),
  };
}

export async function adminUpdateBalance(userId: number, delta: number): Promise<void> {
  await request(`/miniapp/api/admin/users/${userId}/balance`, {
    method: 'POST',
    body: JSON.stringify({ delta, confirm: true }),
  });
}

export async function adminGrantPlan(userId: number, planUuid: string): Promise<void> {
  await request(`/miniapp/api/admin/users/${userId}/grant`, {
    method: 'POST',
    body: JSON.stringify({ plan_uuid: planUuid, confirm: true }),
  });
}

export async function adminBlockUser(userId: number, blocked: boolean): Promise<void> {
  await request(`/miniapp/api/admin/users/${userId}/block`, {
    method: 'POST',
    body: JSON.stringify({ enabled: blocked, confirm: true }),
  });
}

export async function getAdminPlans(): Promise<AdminPlan[]> {
  const raw = await request<Record<string, any>>('/miniapp/api/admin/plans');
  const list = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.plans) ? raw.plans : [];
  return list.map((p: any) => ({
    planUuid: String(p.plan_uuid ?? p.uuid),
    name: String(p.name),
    originalName: String(p.original_name ?? p.name),
    purchasePrice: p.purchase_price != null ? Number(p.purchase_price) : undefined,
    retailPrice: p.retail_price != null ? Number(p.retail_price) : p.price != null ? Number(p.price) : undefined,
    currency: String(p.currency ?? 'RUB'),
    durationDays: p.duration_days != null ? Number(p.duration_days) : p.durationDays != null ? Number(p.durationDays) : 30,
    maxDevices: p.max_devices != null ? Number(p.max_devices) : p.devices != null ? Number(p.devices) : 5,
    isActive: Boolean(p.is_active ?? true),
    isTrial: Boolean(p.is_trial),
    sortOrder: Number(p.sort_order ?? 0),
    periodGroup: p.period_group,
    buttonStyle: p.button_style,
  }));
}

export async function adminUpdatePlanPrice(planUuid: string, retailPrice: number): Promise<void> {
  await request(`/miniapp/api/admin/plans/${encodeURIComponent(planUuid)}/price`, {
    method: 'POST',
    body: JSON.stringify({ retail_price: retailPrice }),
  });
}

export async function adminTogglePlanVisibility(planUuid: string, isActive: boolean): Promise<void> {
  await request(`/miniapp/api/admin/plans/${encodeURIComponent(planUuid)}/visibility`, {
    method: 'POST',
    body: JSON.stringify({ is_active: isActive }),
  });
}

export async function adminEditPlan(planUuid: string, data: {
  name?: string;
  retailPrice?: number;
  isActive?: boolean;
  isPublic?: boolean;
  buttonStyle?: string;
}): Promise<void> {
  await request(`/miniapp/api/admin/plans/${encodeURIComponent(planUuid)}/edit`, {
    method: 'POST',
    body: JSON.stringify({
      name: data.name,
      retail_price: data.retailPrice,
      is_active: data.isActive,
      is_public: data.isPublic,
      button_style: data.buttonStyle,
    }),
  });
}

export async function adminSyncPlans(): Promise<{ ok: boolean }> {
  return await request('/miniapp/api/admin/plans/sync', { method: 'POST' });
}

export async function getAdminPromos(): Promise<AdminPromo[]> {
  const raw = await request<Record<string, any>>('/miniapp/api/admin/promos');
  const list = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.promos) ? raw.promos : [];
  return list.map((p: any) => ({
    id: Number(p.id),
    code: String(p.code),
    discountType: p.discount_type === 'fixed' ? 'fixed_amount' : (p.discount_type ?? 'fixed_amount'),
    discountValue: Number(p.discount_value ?? p.discount ?? 0),
    maxUsages: p.max_usages != null ? Number(p.max_usages) : undefined,
    usedCount: Number(p.used_count ?? p.uses ?? 0),
    isActive: Boolean(p.is_active ?? true),
    expiresAt: p.expires_at ? String(p.expires_at) : undefined,
    createdAt: String(p.created_at ?? ''),
  }));
}

export async function adminCreatePromo(data: {
  code: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  maxUsages?: number;
  expiresDays?: number;
}): Promise<void> {
  await request('/miniapp/api/admin/promos', {
    method: 'POST',
    body: JSON.stringify({
      code: data.code.trim().toUpperCase(),
      amount: data.discountValue,
      discount_value: data.discountValue,
      discount_type: data.discountType,
      max_uses: data.maxUsages,
      max_usages: data.maxUsages,
      expires_in_days: data.expiresDays,
      expires_days: data.expiresDays,
    }),
  });
}

export async function adminTogglePromo(code: string, enabled: boolean): Promise<void> {
  await request(`/miniapp/api/admin/promos/${encodeURIComponent(code)}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function adminSendBroadcast(text: string, buttonText?: string, buttonUrl?: string): Promise<{ sent: number; failed: number }> {
  return request('/miniapp/api/admin/broadcast', {
    method: 'POST',
    body: JSON.stringify({
      text,
      button_text: buttonText,
      button_url: buttonUrl,
      confirm: true,
    }),
  });
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const raw = await request<Record<string, any>>('/miniapp/api/admin/settings');
  return {
    appName: String(raw.app_name ?? 'Mister VPN'),
    supportUrl: String(raw.support_url ?? ''),
    channelUrl: String(raw.channel_url ?? ''),
    currency: String(raw.currency ?? 'RUB'),
    minTopup: Number(raw.min_topup ?? 50),
    maxTopup: Number(raw.max_topup ?? 10000),
    featureReferral: Boolean(raw.feature_referral ?? true),
    featureTrial: Boolean(raw.feature_trial ?? true),
    featureTopup: Boolean(raw.feature_topup ?? true),
    featurePromos: Boolean(raw.feature_promos ?? true),
    featureGifts: Boolean(raw.feature_gifts ?? true),
    featureSupport: Boolean(raw.feature_support ?? true),
    featureMaintenance: Boolean(raw.feature_maintenance ?? false),
    appThemeStyle: (raw.app_theme_style === 'modern' ? 'modern' : 'classic'),
    referralBonusRub: Number(raw.referral_bonus_rub ?? 50),
    referralRewardPercent: Number(raw.referral_reward_percent ?? 15),
  };
}

export async function updateAdminSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> {
  const body: Record<string, any> = {};
  if (settings.appName !== undefined) body.app_name = settings.appName;
  if (settings.supportUrl !== undefined) body.support_url = settings.supportUrl;
  if (settings.channelUrl !== undefined) body.channel_url = settings.channelUrl;
  if (settings.currency !== undefined) body.currency = settings.currency;
  if (settings.minTopup !== undefined) body.min_topup = settings.minTopup;
  if (settings.maxTopup !== undefined) body.max_topup = settings.maxTopup;
  if (settings.featureReferral !== undefined) body.feature_referral = settings.featureReferral;
  if (settings.featureTrial !== undefined) body.feature_trial = settings.featureTrial;
  if (settings.featureTopup !== undefined) body.feature_topup = settings.featureTopup;
  if (settings.featurePromos !== undefined) body.feature_promos = settings.featurePromos;
  if (settings.featureGifts !== undefined) body.feature_gifts = settings.featureGifts;
  if (settings.featureSupport !== undefined) body.feature_support = settings.featureSupport;
  if (settings.featureMaintenance !== undefined) body.feature_maintenance = settings.featureMaintenance;
  if (settings.appThemeStyle !== undefined) body.app_theme_style = settings.appThemeStyle;
  if (settings.referralBonusRub !== undefined) body.referral_bonus_rub = settings.referralBonusRub;
  if (settings.referralRewardPercent !== undefined) body.referral_reward_percent = settings.referralRewardPercent;

  const raw = await request<Record<string, any>>('/miniapp/api/admin/settings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return {
    appName: String(raw.app_name ?? 'Mister VPN'),
    supportUrl: String(raw.support_url ?? ''),
    channelUrl: String(raw.channel_url ?? ''),
    currency: String(raw.currency ?? 'RUB'),
    minTopup: Number(raw.min_topup ?? 50),
    maxTopup: Number(raw.max_topup ?? 10000),
    featureReferral: Boolean(raw.feature_referral ?? true),
    featureTrial: Boolean(raw.feature_trial ?? true),
    featureTopup: Boolean(raw.feature_topup ?? true),
    featurePromos: Boolean(raw.feature_promos ?? true),
    featureGifts: Boolean(raw.feature_gifts ?? true),
    featureSupport: Boolean(raw.feature_support ?? true),
    featureMaintenance: Boolean(raw.feature_maintenance ?? false),
    appThemeStyle: (raw.app_theme_style === 'modern' ? 'modern' : 'classic'),
    referralBonusRub: Number(raw.referral_bonus_rub ?? 50),
    referralRewardPercent: Number(raw.referral_reward_percent ?? 15),
  };
}

