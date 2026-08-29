export type TabType = 'home' | 'pricing' | 'devices' | 'profile' | 'admin';

export interface User {
  id: any;
  telegramId?: any;
  username?: any;
  firstName?: any;
  lastName?: any;
  balance?: any;
  balanceCurrency?: any;
  currency?: any;
  role?: any;
  isAdmin?: any;
  isBlocked?: any;
  trialClaimed?: any;
  invitedBy?: any;
  referrerId?: any;
  referralEarned?: any;
  referralCode?: any;
  createdAt?: any;
  hasSubscription?: any;
}

export interface Subscription {
  id?: any;
  uuid?: any;
  planUuid?: any;
  planName?: any;
  status?: any;
  isActive?: any;
  isFrozen?: any;
  isExpired?: any;
  isTrial?: any;
  startsAt?: any;
  expiresAt?: any;
  renewsAt?: any;
  daysLeft?: any;
  devicesUsed?: any;
  devicesMax?: any;
  trafficLimitGb?: any;
  trafficUsedGb?: any;
  trafficLimitBytes?: any;
  trafficUsedBytes?: any;
  maxDevices?: any;
  subscriptionUrl?: any;
  publicUrl?: any;
  directUrl?: any;
  fallbackUrl?: any;
  rawConfig?: any;
  autoRenewEnabled?: any;
}

export interface Device {
  id: string;
  name?: string;
  platform?: any;
  deviceModel?: string;
  deviceOs?: string;
  ip?: string;
  lastSeen?: string;
  createdAt?: string;
  isActive?: boolean;
}

export interface ConnectionLog {
  id: string;
  timestamp: any;
  serverName?: string;
  trafficBytes?: number;
  durationSeconds?: number;
  ip?: string;
  device?: string;
  location?: string;
  status?: string;
}

export interface Plan {
  id?: any;
  uuid: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  durationDays: number;
  devices: number;
  trafficGb?: number;
  trafficLimitBytes?: number;
  isPopular?: boolean;
  popular?: boolean;
  isTrial?: boolean;
  badge?: string;
  buttonStyle?: string;
  periodGroup?: string;
  sortOrder?: number;
  features?: string[];
}

export interface PromoCode {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minAmount?: number;
}

export interface AppConfig {
  trialDays: number;
  minTopup: number;
  maxTopup: number;
  referralRewardRub: number;
  referralPercent: number;
  supportUsername?: string;
  channelUrl?: string;
  rulesUrl?: string;
}

export interface Order {
  uuid: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  paymentProvider?: string;
  createdAt: number;
  planName?: string;
  paymentMethod?: string;
}

export interface ReferralInfo {
  link: string;
  invited: number;
  earned: number;
  bonus: number;
  currency: string;
}

export interface AdminOverview {
  totalUsers: number;
  newUsers24h: number;
  activeSubscriptions: number;
  expiring7d: number;
  ordersCount: number;
  pendingOrders: number;
  revenueToday: number;
  revenueMonth: number;
  paidOrders30d: number;
  activePromos: number;
  adaptgroupOnline: boolean;
  adaptgroupLatency?: number;
  adaptgroupMessage?: string;
  adaptgroupBalance?: number | null;
  adaptgroupCurrency?: string;
}

export interface AdminUser {
  id: number;
  telegramId: number;
  username?: string;
  firstName?: string;
  balance: number;
  balanceCurrency: string;
  isBlocked: boolean;
  hasActiveSubscription: boolean;
  trialClaimed: boolean;
  createdAt: string;
  lastActivityAt?: string;
  adminNote?: string;
  adminTags?: string[];
}

export interface AdminPlan {
  planUuid: string;
  name: string;
  originalName: string;
  purchasePrice?: number;
  retailPrice?: number;
  currency: string;
  durationDays?: number;
  maxDevices?: number;
  isActive: boolean;
  isTrial: boolean;
  sortOrder: number;
  periodGroup?: string;
  buttonStyle?: string;
}

export interface AdminPromo {
  id: number;
  code: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  maxUsages?: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface AdminSettings {
  appName: string;
  supportUrl: string;
  channelUrl: string;
  currency: string;
  minTopup: number;
  maxTopup: number;
  featureReferral: boolean;
  featureTrial: boolean;
  featureTopup: boolean;
  featurePromos: boolean;
  featureGifts: boolean;
  featureSupport: boolean;
  featureMaintenance: boolean;
  appThemeStyle?: 'classic' | 'modern';
  referralBonusRub: number;
  referralRewardPercent: number;
}
