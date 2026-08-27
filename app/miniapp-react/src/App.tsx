import React, { Suspense, useEffect } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { TabFlowProvider, TabPager } from './components/TabFlow';
import { Screen } from './components/Screen';
import { SkeletonRow } from './components/Controls';
import { GradientButton } from './components/GradientButton';
import { isMainTabPath } from './lib/tabs';
import { initTelegram } from './lib/telegram';
import { useAppStore } from './store/useAppStore';

const HomeScreen = React.lazy(() => import('./screens/HomeScreen'));
const PricingScreen = React.lazy(() => import('./screens/PricingScreen'));
const DevicesScreen = React.lazy(() => import('./screens/DevicesScreen'));
const ProfileScreen = React.lazy(() => import('./screens/ProfileScreen'));
const AdminScreen = React.lazy(() => import('./screens/AdminScreen'));
const HistoryScreen = React.lazy(() => import('./screens/HistoryScreen'));
const PlanDetailScreen = React.lazy(() => import('./screens/PlanDetailScreen'));
const SupportScreen = React.lazy(() => import('./screens/SupportScreen'));

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
    <MotionConfig reducedMotion="user">
      <TabFlowProvider>
        {/* Full-app atmospheric character mascot watermark background */}
        <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
          <img
            src="/miniapp/static/mister-character.png"
            alt=""
            className="h-full max-h-[88vh] w-auto max-w-[95vw] object-contain opacity-[0.20] filter grayscale select-none"
            loading="eager"
          />
        </div>

        <div
          className="relative z-10 mx-auto min-h-dvh max-w-md px-4 pt-safe pb-safe"
          style={{ minHeight: '100dvh' }}
        >
          <Suspense fallback={<BootSkeleton />}>
            {mainTab ? (
              <TabPager pages={mainPages} />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <Routes location={location} key={location.pathname}>
                  <Route path="/admin" element={<AdminScreen />} />
                  <Route path="/history" element={<HistoryScreen />} />
                  <Route path="/plan/:planId" element={<PlanDetailScreen />} />
                  <Route path="/support" element={<SupportScreen />} />
                </Routes>
              </AnimatePresence>
            )}
          </Suspense>
          <BottomNav />
        </div>
      </TabFlowProvider>
    </MotionConfig>
  );
}

function BootSkeleton() {
  return (
    <Screen>
      <div className="space-y-4 pt-6">
        <div className="mx-auto mb-6 h-[140px] w-[140px]">
          <div className="skeleton h-full w-full rounded-3xl" />
        </div>
        {[0, 1, 2, 3].map((i) => (
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
        <h1 className="text-[22px] font-semibold text-white">Не удалось загрузить Mister VPN</h1>
        <p className="text-[14px] text-txt2">{message}</p>
        <GradientButton onClick={onRetry}>Повторить попытку</GradientButton>
      </div>
    </Screen>
  );
}
