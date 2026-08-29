import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, ArrowRight, Smartphone, Monitor, Tv, Laptop, Copy, ExternalLink } from 'lucide-react';
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
          'Установите бесплатное приложение Happ из App Store.',
          'Нажмите кнопку «Импортировать в Happ» ниже.',
          'В приложении Happ нажмите круглую кнопку для включения защиты.',
        ],
      },
      {
        name: 'Incy',
        scheme: 'incy://sub?url=',
        downloadUrl: 'https://apps.apple.com/app/incy/id6756943388',
        instructions: [
          'Скачайте Incy из App Store.',
          'Скопируйте вашу ссылку подписки и откройте Incy.',
          'Вставьте ссылку через «+» и выберите узел.',
        ],
      },
      {
        name: 'V2RayTun',
        scheme: 'v2raytun://import/',
        downloadUrl: 'https://apps.apple.com/us/app/v2raytun/id6476628951',
        instructions: [
          'Установите V2RayTun из App Store.',
          'Импортируйте подписку по ссылке или QR-коду.',
          'Включите туннель.',
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
          'Скачайте Happ из Google Play.',
          'Нажмите кнопку «Импортировать в Happ».',
          'Разрешите подключение VPN и нажмите Пуск.',
        ],
      },
      {
        name: 'Incy',
        scheme: 'incy://sub?url=',
        downloadUrl: 'https://play.google.com/store/apps/details?id=llc.itdev.incy',
        instructions: [
          'Установите Incy из Google Play.',
          'Добавьте ссылку подписки и активируйте защиту.',
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
          'Скачайте клиент Happ для Mac с официального сайта.',
          'Скопируйте ссылку подписки и вставьте в приложение.',
          'Подключитесь к серверу.',
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
          'Установите Happ Desktop для Windows.',
          'Добавьте подписку по скопированной ссылке.',
          'Включите системный прокси/VPN.',
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
          'Установите Karing на ваш Smart TV.',
          'Отсканируйте QR-код подписки с экрана телефона.',
          'Наслаждайтесь просмотром YouTube 4K без замедлений.',
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
      showAlert('✅ Ссылка подписки скопирована в буфер!');
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

  const handleNext = () => {
    haptic('medium');
    setSelectedAppIndex(0);
    setStep('guide');
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
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] border border-white/15 bg-[#0a0a0f] p-6 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h3 className="text-base font-bold text-white">
                {step === 'select' ? 'Выберите тип вашего устройства' : `Настройка: ${currentPlatform.name}`}
              </h3>
              <button
                type="button"
                onClick={handleReset}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {step === 'select' ? (
              <div className="py-4 space-y-2.5">
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
                          ? 'border-white/40 bg-white/[0.1] shadow-lg shadow-white/[0.03]'
                          : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isSelected ? 'bg-white text-black' : 'bg-white/10 text-white'}`}>
                          <Icon size={20} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{plat.name}</div>
                          <div className="text-[11px] text-txt3">{plat.sub}</div>
                        </div>
                      </div>

                      <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? 'border-white bg-white' : 'border-white/20'}`}>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-black" />}
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={handleNext}
                  className="mt-4 flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-white to-zinc-300 font-bold text-black text-sm shadow-xl active:scale-98 transition-transform"
                >
                  <span>Далее</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div className="py-4 space-y-4">
                {currentPlatform.apps.length > 1 && (
                  <div className="flex gap-2">
                    {currentPlatform.apps.map((app, idx) => (
                      <button
                        key={app.name}
                        type="button"
                        onClick={() => {
                          haptic('light');
                          setSelectedAppIndex(idx);
                        }}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                          idx === selectedAppIndex
                            ? 'bg-white text-black border-white'
                            : 'bg-white/5 text-txt2 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {app.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2.5">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Инструкция по подключению</span>
                  </div>
                  <ol className="space-y-2 text-[12px] text-txt2 list-decimal list-inside leading-relaxed">
                    {currentApp.instructions.map((ins, i) => (
                      <li key={i} className="text-zinc-300">
                        {ins}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleOpenApp}
                    className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white font-bold text-black text-xs shadow-lg active:scale-98 transition-transform"
                  >
                    <span>🚀 Открыть {currentApp.name}</span>
                  </button>

                  <a
                    href={currentApp.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 font-bold text-white text-xs hover:bg-white/10 active:scale-98 transition-transform"
                  >
                    <ExternalLink size={14} />
                    <span>Скачать</span>
                  </a>
                </div>

                <button
                  type="button"
                  onClick={handleCopySub}
                  className="flex w-full h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-txt2 hover:text-white"
                >
                  <Copy size={14} />
                  <span>Скопировать ключ подписки</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep('select')}
                  className="w-full text-center text-xs font-semibold text-txt3 hover:text-white py-1"
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
