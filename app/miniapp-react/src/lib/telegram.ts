import { useEffect } from 'react';
import WebApp from '@twa-dev/sdk';

type Impact = 'light' | 'medium' | 'heavy';
type Notification = 'error' | 'success' | 'warning';

export const tg = WebApp;

export function openTelegramLink(url: string): void {
  try {
    if (tg && typeof (tg as any).openTelegramLink === 'function') {
      (tg as any).openTelegramLink(url);
      return;
    }
  } catch {
    /* fallback */
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openLink(url: string): void {
  try {
    if (url.startsWith('https://t.me/') || url.startsWith('tg://')) {
      if (tg && typeof (tg as any).openTelegramLink === 'function') {
        (tg as any).openTelegramLink(url);
        return;
      }
    }
    if (tg && typeof tg.openLink === 'function') {
      tg.openLink(url);
      return;
    }
  } catch {
    /* fallback */
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function initTelegram(): void {
  try {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
  } catch {
    /* running outside Telegram (dev preview) */
  }
}

export function haptic(style: Impact = 'light'): void {
  try {
    tg.HapticFeedback.impactOccurred(style);
  } catch {
    /* noop */
  }
}

export function hapticNotify(type: Notification): void {
  try {
    tg.HapticFeedback.notificationOccurred(type);
  } catch {
    /* noop */
  }
}

export function hapticSelect(): void {
  try {
    tg.HapticFeedback.selectionChanged();
  } catch {
    /* noop */
  }
}

interface BackHandler {
  (): void;
}

let backHandler: BackHandler | null = null;

export function showBackButton(handler: BackHandler): void {
  hideBackButton();
  backHandler = handler;
  try {
    tg.BackButton.onClick(handler);
    tg.BackButton.show();
  } catch {
    /* noop */
  }
}

export function hideBackButton(): void {
  if (!backHandler) return;
  try {
    tg.BackButton.offClick(backHandler);
    tg.BackButton.hide();
  } catch {
    /* noop */
  }
  backHandler = null;
}

interface MainButtonOptions {
  text: string;
  onClick: () => void;
}

export function useMainButton({ text, onClick }: MainButtonOptions): void {
  useEffect(() => {
    if (!text) return;
    const handler = (): void => onClick();
    try {
      tg.MainButton.setParams({
        text,
        color: '#8B5CF6',
        text_color: '#ffffff',
        is_visible: true,
        is_active: true,
      });
      tg.MainButton.onClick(handler);
    } catch {
      /* noop */
    }
    return () => {
      try {
        tg.MainButton.offClick(handler);
        tg.MainButton.hide();
      } catch {
        /* noop */
      }
    };
  }, [text, onClick]);
}

export function setMainButtonLoading(loading: boolean): void {
  try {
    if (loading) tg.MainButton.showProgress(false);
    else tg.MainButton.hideProgress();
  } catch {
    /* noop */
  }
}

export function cloudSave(key: string, value: unknown): void {
  try {
    tg.CloudStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

export function showAlert(message: string): void {
  try {
    tg.showAlert(message);
  } catch {
    window.alert(message);
  }
}
