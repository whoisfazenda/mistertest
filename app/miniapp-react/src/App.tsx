import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { TabFlowProvider, TabPager } from './components/TabFlow';
import { Screen } from './components/Screen';
import { SkeletonRow } from './components/Controls';
import { GradientButton } from './components/GradientButton';
import { isMainTabPath } from './lib/tabs';
import { initTelegram } from './lib/telegram';
import { useAppStore } from './store/useAppStore';

import HomeScreen from './screens/HomeScreen';
import PricingScreen from './screens/PricingScreen';
import DevicesScreen from './screens/DevicesScreen';
import ProfileScreen from './screens/ProfileScreen';
import AdminScreen from './screens/AdminScreen';
import HistoryScreen from './screens/HistoryScreen';
import PlanDetailScreen from './screens/PlanDetailScreen';
import SupportScreen from './screens/SupportScreen';

export default function App() {
  const location = useLocation();
  const bootstrap = useAppStore((s) => s.bootstrap);
  const user = useAppStore((s) => s.user);
  const bootstrapError = useAppStore((s) => s.bootstrapError);
  const isAdmin = Boolean(user?.isAdmin);
  const mainTab = isMainTabPath(location.pathname, isAdmin);

  useEffect(() => {
    initTelegram();
    void bootstrap();
  }, [bootstrap]);

  const home = bootstrapError ? (
    <BootError message={bootstrapError} onRetry={() => void bootstrap()} />
  ) : !user ? (
    <BootSkeleton />
  ) : (
    <HomeScreen />
  );

  const mainPages = [
    home,
    <PricingScreen key="pricing" />,
    <DevicesScreen key="devices" />,
    <ProfileScreen key="profile" />,
  ];

  if (isAdmin) {
    mainPages.push(<AdminScreen key="admin" />);
  }

  return (
    <TabFlowProvider>
      {/* Background character watermark */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
        <img
          src="/miniapp/static/mister-character.png"
          alt=""
          className="h-full max-h-[88vh] w-auto max-w-[95vw] object-contain opacity-[0.16] filter grayscale select-none"
          loading="eager"
        />
      </div>

      <div
        className="relative z-10 mx-auto min-h-dvh max-w-md px-4 pt-safe pb-safe"
        style={{ minHeight: '100dvh' }}
      >
        {mainTab ? (
          <TabPager pages={mainPages} />
        ) : (
          <Routes location={location} key={location.pathname}>
            <Route path="/admin" element={<AdminScreen />} />
            <Route path="/history" element={<HistoryScreen />} />
            <Route path="/plan/:planId" element={<PlanDetailScreen />} />
            <Route path="/support" element={<SupportScreen />} />
          </Routes>
        )}
        <BottomNav />
      </div>
    </TabFlowProvider>
  );
}

function BootSkeleton() {
  return (
    <Screen>
      <div className="space-y-4 pt-6">
        <div className="mx-auto mb-6 h-[120px] w-[120px]">
          <div className="skeleton h-full w-full rounded-3xl" />
        </div>
        {[0, 1, 2].map((i) => (
          <SkeletonRow key={i} lines={1} />
        ))}
      </div>
    </Screen>
  );
}

function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Screen>
      <div className="space-y-4 pt-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-3xl">
          ⚠️
        </div>
        <h1 className="text-[20px] font-semibold text-white">Не удалось подключиться</h1>
        <p className="text-[13px] text-txt2">{message}</p>
        <div className="pt-2">
          <GradientButton onClick={onRetry}>Повторить попытку</GradientButton>
        </div>
      </div>
    </Screen>
  );
}
