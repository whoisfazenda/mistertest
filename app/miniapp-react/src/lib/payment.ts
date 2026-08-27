import type { PaymentResult } from '../api/client';
import { openLink } from './telegram';

export async function applyPayment(
  result: PaymentResult,
  refresh: () => Promise<void>,
): Promise<string> {
  if (result.confirmationUrl) {
    openLink(result.confirmationUrl);
    return result.message ?? 'Перейдите к оплате в открывшемся окне';
  }
  if (result.completed) {
    await refresh();
    return result.message ?? 'Готово';
  }
  if (result.needsTopup) {
    throw new Error(result.message ?? 'Недостаточно средств на балансе');
  }
  throw new Error(result.message ?? 'Не удалось создать оплату');
}
