import { create } from 'zustand';
import type { Device, Order, Plan, Subscription, User } from '../types';
import * as api from '../api/client';
import type { AppConfig, TrialOffer } from '../api/client';
import { cloudSave } from '../lib/telegram';

const AUTO_SERVER = {
  id: 'automatic',
  country: 'Автоматический выбор',
  city: 'Лучший сервер',
  flag: '🌐',
  latencyMs: 0,
  loadPct: 0,
};

export interface AppState {
  user: User | null;
  plans: Plan[];
  devices: Device[];
  subscription: Subscription | null;
  orders: Order[];
  trial: TrialOffer | null;
  config: AppConfig | null;
  bootstrapped: boolean;
  bootstrapError: string | null;
  selectedServer: typeof AUTO_SERVER;

  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
}

function applyBootstrap(
  data: api.BootstrapData,
): Pick<
  AppState,
  'user' | 'plans' | 'devices' | 'subscription' | 'orders' | 'trial' | 'config' | 'bootstrapped' | 'bootstrapError'
> {
  cloudSave('mvp-user-cache', { id: data.user.id, firstName: data.user.firstName });
  return {
    user: data.user,
    plans: data.plans,
    devices: data.devices,
    subscription: data.subscription,
    orders: data.orders,
    trial: data.trial,
    config: data.config,
    bootstrapped: true,
    bootstrapError: null,
  };
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  plans: [],
  devices: [],
  subscription: null,
  orders: [],
  trial: null,
  config: null,
  bootstrapped: false,
  bootstrapError: null,
  selectedServer: AUTO_SERVER,

  bootstrap: async () => {
    try {
      const data = await api.getBootstrap();
      set(applyBootstrap(data));
    } catch (error) {
      set({
        bootstrapError: error instanceof Error ? error.message : 'Не удалось загрузить данные',
        bootstrapped: false,
      });
    }
  },

  refresh: async () => {
    const data = await api.getBootstrap();
    set(applyBootstrap(data));
  },
}));
