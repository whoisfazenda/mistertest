import { GlassCard } from '../components/GlassCard';
import { Screen, ScreenHeader } from '../components/Screen';

export default function ServersScreen() {
  return (
    <Screen>
      <ScreenHeader title="Сервер" subtitle="Автоматический выбор" />
      <GlassCard>
        <h3 className="font-semibold">Лучший сервер выбирается автоматически</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-txt2">
          Ручной выбор локации в Mini App недоступен: VPN-панель сама направляет трафик.
          Откройте ссылку подписки в клиенте, чтобы подключиться.
        </p>
      </GlassCard>
    </Screen>
  );
}
