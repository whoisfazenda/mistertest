import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, Smartphone, Monitor, Tv, Laptop, Copy, ExternalLink } from 'lucide-react';
import { haptic, hapticNotify, showAlert } from '../../lib/telegram';
import { useAppStore } from '../../store/useAppStore';

interface ModernDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PlatformKey = 'ios' | 'android' | 'macos' | 'windows' | 'tv';

interface PlatformInfo {
  id: PlatformKey;
  name: string;
  sub: string;
  icon: typeof Smartphone;
  apps: {
    name: string;
    scheme: string;
    downloadUrl: string;
    instructions: string[];
  }[];
}

const PLATFORMS: PlatformInfo[] = [
  {
    id: 'ios',
    name: 'iOS (iPhone, iPad)',
    sub: 'Happ, Incy, V2RayTun, Karing',
    icon: Smartphone,
    apps: [
      {
        name: 'Happ',
        scheme: 'happ://add/sub?url=',
        downloadUrl: 'https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973',
        instructions: [
          '1. Установите бесплатное приложение Happ из App Store.',
          '2. Нажмите кнопку «Импортировать в Happ» ниже.',
          '3. В приложении Happ нажмите кнопку для включения защиты.',
        ],
      },
      {
        name: 'Incy',
        scheme: 'incy://sub?url=',
        downloadUrl: 'https://apps.apple.com/app/incy/id6756943388',
        instructions: [
          '1. Скачайте Incy из App Store.',
          '2. Скопируйте ссылку подписки и откройте Incy.',
          '3. Вставьте ссылку через «+» и выберите узел.',
        ],
      },
      {
        name: 'V2RayTun',
        scheme: 'v2raytun://import/',
        downloadUrl: 'https://apps.apple.com/us/app/v2raytun/id6476628951',
        instructions: [
          '1. Установите V2RayTun из App Store.',
          '2. Импортируйте подписку по ссылке или QR-коду.',
          '3. Включите туннель.',
        ],
      },
    ],
  },
  {
    id: 'android',
    name: 'Android',
    sub: 'Happ, Incy, V2RayTun, Karing',
    icon: Smartphone,
    apps: [
      {
        name: 'Happ',
        scheme: 'happ://add/sub?url=',
        downloadUrl: 'https://play.google.com/store/search?q=happ&c=apps&hl=ru',
        instructions: [
          '1. Скачайте Happ из Google Play.',
          '2. Нажмите кнопку «Импортировать в Happ».',
          '3. Разрешите подключение VPN и нажмите Пуск.',
        ],
      },
      {
        name: 'Incy',
        scheme: 'incy://sub?url=',
        downloadUrl: 'https://play.google.com/store/apps/details?id=llc.itdev.incy',
        instructions: [
          '1. Установите Incy из Google Play.',
          '2. Добавьте ссылку подписки и активируйте защиту.',
        ],
      },
    ],
  },
  {
    id: 'macos',
    name: 'MacOS',
    sub: 'Happ Desktop, Karing, Incy',
    icon: Laptop,
    apps: [
      {
        name: 'Happ Desktop',
        scheme: 'happ://add/sub?url=',
        downloadUrl: 'https://www.happ.su/main/ru',
        instructions: [
          '1. Скачайте клиент Happ для Mac с официального сайта.',
          '2. Скопируйте ссылку подписки и вставьте в приложение.',
          '3. Подключитесь к серверу.',
        ],
      },
    ],
  },
  {
    id: 'windows',
    name: 'Windows',
    sub: 'Happ Desktop, V2RayTun, Karing',
    icon: Monitor,
    apps: [
      {
        name: 'Happ Desktop',
        scheme: 'happ://add/sub?url=',
        downloadUrl: 'https://www.happ.su/main/ru',
        instructions: [
          '1. Установите Happ Desktop для Windows.',
          '2. Добавьте подписку по скопированной ссылке.',
          '3. Включите системный прокси/VPN.',
        ],
      },
    ],
  },
  {
    id: 'tv',
    name: 'Android TV / Apple TV',
    sub: 'Karing, Happ TV',
    icon: Tv,
    apps: [
      {
        name: 'Karing TV',
        scheme: 'karing://install-config?url=',
        downloadUrl: 'https://github.com/KaringX/karing/releases',
        instructions: [
          '1. Установите Karing на ваш Smart TV.',
          '2. Отсканируйте QR-код подписки с экрана телефона.',
          '3. Наслаждайтесь просмотром YouTube 4K без замедлений.',
        ],
      },
    ],
  },
];

export function ModernDeviceModal({ isOpen, onClose }: ModernDeviceModalProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey>('ios');
  const [step, setStep] = useState<'select' | 'guide'>('select');
  const [selectedAppIndex, setSelectedAppIndex] = useState(0);

  const subscription = useAppStore((s) => s.subscription);
  const subUrl = subscription?.subscriptionUrl || subscription?.publicUrl || window.location.href;

  const currentPlatform = PLATFORMS.find((p) => p.id === selectedPlatform) || PLATFORMS[0];
  const currentApp = currentPlatform.apps[selectedAppIndex] || currentPlatform.apps[0];

  const handleCopySub = async () => {
    if (!subUrl) return;
    try {
      await navigator.clipboard.writeText(subUrl);
      hapticNotify('success');
      showAlert('✅ Ссылка подписки скопирована!');
    } catch {
      showAlert(subUrl);
    }
  };

  const handleOpenApp = () => {
    haptic('medium');
    const launchUrl = currentApp.scheme + encodeURIComponent(subUrl);
    window.location.href = launchUrl;
    setTimeout(() => {
      handleCopySub();
    }, 400);
  };

  const handleReset = () => {
    setStep('select');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 select-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleReset}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="relative z-10 w-full max-w-md rounded-t-[32px] sm:rounded-[32px] bg-white p-6 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto text-[#0f172a]"
          >
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-base font-black text-[#0f172a] text-center flex-1">
                {step === 'select' ? 'Выберите тип вашего устройства' : `Настройка: ${currentPlatform.name}`}
              </h3>
              <button
                type="button"
                onClick={handleReset}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f1f5f9] text-[#64748b] hover:text-[#0f172a]"
              >
                <X size={15} />
              </button>
            </div>

            {step === 'select' ? (
              <div className="py-2 space-y-2">
                {PLATFORMS.map((plat) => {
                  const isSelected = plat.id === selectedPlatform;
                  const Icon = plat.icon;
                  return (
                    <div
                      key={plat.id}
                      onClick={() => {
                        haptic('light');
                        setSelectedPlatform(plat.id);
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#38bdf8] bg-[#f0f9ff] shadow-sm'
                          : 'border-transparent bg-[#f8fafc] hover:bg-[#f1f5f9]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#0f172a] shadow-xs">
                          <Icon size={18} />
                        </div>
                        <div className="text-xs font-bold text-[#0f172a]">{plat.name}</div>
                      </div>

                      <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? 'border-[#38bdf8] bg-[#38bdf8]' : 'border-[#cbd5e1] bg-white'}`}>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    haptic('medium');
                    setStep('guide');
                  }}
                  className="mt-4 flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-[#38bdf8] font-bold text-white text-sm shadow-md active:scale-98 transition-transform"
                >
                  <span>Далее</span>
                </button>
              </div>
            ) : (
              <div className="py-2 space-y-4">
                {currentPlatform.apps.length > 1 && (
                  <div className="flex gap-2 bg-[#f1f5f9] p-1 rounded-xl">
                    {currentPlatform.apps.map((app, idx) => (
                      <button
                        key={app.name}
                        type="button"
                        onClick={() => {
                          haptic('light');
                          setSelectedAppIndex(idx);
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          idx === selectedAppIndex
                            ? 'bg-white text-[#0f172a] shadow-sm'
                            : 'text-[#64748b] hover:text-[#0f172a]'
                        }`}
                      >
                        {app.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="rounded-2xl bg-[#f8fafc] p-4 space-y-2 border border-[#f1f5f9]">
                  <div className="text-xs font-bold text-[#0f172a]">Инструкция по подключению:</div>
                  <div className="space-y-1.5 text-xs text-[#475569] leading-relaxed">
                    {currentApp.instructions.map((ins, i) => (
                      <div key={i}>{ins}</div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleOpenApp}
                    className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#38bdf8] font-bold text-white text-xs shadow-md active:scale-98 transition-transform"
                  >
                    <span>🚀 Открыть {currentApp.name}</span>
                  </button>

                  <a
                    href={currentApp.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#f1f5f9] font-bold text-[#0f172a] text-xs hover:bg-[#e2e8f0] active:scale-98 transition-transform"
                  >
                    <ExternalLink size={14} />
                    <span>Скачать</span>
                  </a>
                </div>

                <button
                  type="button"
                  onClick={handleCopySub}
                  className="flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-[#f1f5f9] text-xs font-bold text-[#0f172a] hover:bg-[#e2e8f0]"
                >
                  <Copy size={14} />
                  <span>Скопировать ключ подписки</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep('select')}
                  className="w-full text-center text-xs font-semibold text-[#64748b] hover:text-[#0f172a] py-1"
                >
                  ← Выбрать другое устройство
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
