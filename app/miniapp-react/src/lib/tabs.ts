import { Laptop, Layers, Shield, ShieldAlert, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface Tab {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const BASE_TABS: Tab[] = [
  { path: '/', label: 'Мой VPN', icon: Shield },
  { path: '/pricing', label: 'Тарифы', icon: Layers },
  { path: '/devices', label: 'Устройства', icon: Laptop },
  { path: '/profile', label: 'Профиль', icon: UserRound },
];

export const ADMIN_TAB: Tab = { path: '/admin', label: 'Админка', icon: ShieldAlert };

export const TABS = BASE_TABS;

export function getTabs(isAdmin: boolean = false): Tab[] {
  return isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;
}

export function tabIndexFromPath(pathname: string, isAdmin: boolean = false): number {
  if (pathname === '/') return 0;
  const tabs = getTabs(isAdmin);
  const index = tabs.findIndex((tab) => tab.path !== '/' && pathname.startsWith(tab.path));
  return index >= 0 ? index : -1;
}

export function isMainTabPath(pathname: string, isAdmin: boolean = false): boolean {
  const tabs = getTabs(isAdmin);
  return tabs.some((tab) => tab.path === pathname || (tab.path !== '/' && pathname.startsWith(tab.path)));
}
