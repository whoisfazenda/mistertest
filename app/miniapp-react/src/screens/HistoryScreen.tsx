import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '../components/GlassCard';
import { HeroBanner } from '../components/HeroBanner';
import { Screen } from '../components/Screen';
import { EASE, formatDateTime, formatRub, orderStatusLabel, orderTypeLabel } from '../lib/format';
import { useAppStore } from '../store/useAppStore';

export default function HistoryScreen() {
  const navigate = useNavigate();
  const orders = useAppStore((s) => s.orders);

  return (
    <Screen>
      <div className="space-y-4 pt-1">
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.08]"
        >
          <ArrowLeft size={16} />
          <span>Назад в профиль</span>
        </button>

        <HeroBanner
          imageName="transactions.png"
          badge="История операций"
          title="Все заказы и платежи"
          subtitle="Статусы оплат, продлений и пополнений баланса"
        />

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="space-y-2.5"
        >
          {orders.length === 0 ? (
            <GlassCard className="p-8 text-center text-txt2 text-xs">
              История операций пока пуста
            </GlassCard>
          ) : (
            orders.map((order) => {
              const isPaid = order.status === 'paid' || order.status === 'completed';
              return (
                <GlassCard key={order.uuid} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-white text-sm">
                        {order.planName || orderTypeLabel(order.type)}
                      </h4>
                      <p className="text-xs text-txt2 mt-0.5">
                        <span
                          className={`font-semibold ${
                            isPaid ? 'text-white' : 'text-zinc-400'
                          }`}
                        >
                          {orderStatusLabel(order.status)}
                        </span>
                        {order.paymentMethod ? ` · ${order.paymentMethod}` : ''}
                      </p>
                    </div>
                    <p className="font-mono font-bold text-white text-base">
                      {formatRub(order.amount)}
                    </p>
                  </div>
                  <p className="text-[10px] text-txt3">{formatDateTime(order.createdAt)}</p>
                </GlassCard>
              );
            })
          )}
        </motion.div>
      </div>
    </Screen>
  );
}
