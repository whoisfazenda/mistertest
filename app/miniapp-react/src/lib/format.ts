export const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export const pageVariants = {
  initial: { x: '100%', opacity: 0 },
  enter: { x: 0, opacity: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

export const staggerItem = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { duration: 0.4, ease: EASE } },
};

export function formatRub(value: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₽`;
}

export function formatGb(value: number): string {
  const num = Number(value) || 0;
  if (num <= 0) return '0 ГБ';
  const rounded10 = Math.round(num * 10) / 10;
  if (rounded10 === Math.floor(rounded10)) {
    return `${rounded10} ГБ`;
  }
  return `${rounded10.toFixed(1)} ГБ`;
}

export function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
}

export function formatDateTime(ts: number): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

export function orderTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    new_subscription: 'Покупка тарифа',
    renew: 'Продление',
    renew_custom: 'Продление',
    balance_topup: 'Пополнение',
    traffic: 'Трафик',
    upgrade: 'Улучшение',
    gift: 'Подарок',
  };
  return labels[type] ?? 'Операция';
}

export function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'ожидает оплаты',
    paid: 'оплачено',
    provisioning: 'выдаётся',
    completed: 'успешно',
    failed: 'ошибка',
    cancelled: 'отменено',
  };
  return labels[status] ?? status;
}
