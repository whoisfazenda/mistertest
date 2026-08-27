import { AnimatePresence, motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ConnectionLog } from '../types';
import { Pill } from '../components/Controls';
import { SectionTitle } from '../components/GlassCard';
import { Screen } from '../components/Screen';
import { EASE, formatDateTime, staggerItem } from '../lib/format';
import * as api from '../api/client';
import { showAlert } from '../lib/telegram';

type Filter = 'all' | 'success' | 'error';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'ВСЕ' },
  { id: 'success', label: 'УСПЕХ' },
  { id: 'error', label: 'ОШИБКИ' },
];

export default function JournalScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [logs, setLogs] = useState<ConnectionLog[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLogs(null);
    void api
      .getConnections(filter)
      .then((data) => {
        if (!cancelled) setLogs(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLogs([]);
          showAlert(error instanceof Error ? error.message : 'Не удалось загрузить журнал');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <Screen>
      <h1 className="text-[28px] font-bold">Журнал</h1>
      <p className="mt-1 text-[15px] text-txt2">Подключения ваших устройств</p>

      <div className="-mx-4 mt-4 flex gap-1 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
        {FILTERS.map(({ id, label }) => (
          <Pill
            key={id}
            active={filter === id}
            layoutGroup="journal"
            onClick={() => setFilter(id)}
          >
            {label}
          </Pill>
        ))}
      </div>

      <SectionTitle>События</SectionTitle>

      {!logs ? (
        <JournalSkeleton />
      ) : logs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex flex-col items-center py-16 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03]">
            <Activity size={28} strokeWidth={1.5} className="text-txt2" />
          </div>
          <h3 className="text-lg font-semibold">Пока ничего</h3>
          <p className="mt-1 max-w-[220px] text-[13px] text-txt2">
            Здесь появятся события подключений
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          initial="hidden"
          animate="show"
          className="space-y-3"
        >
          <AnimatePresence mode="popLayout">
            {logs.map((log) => (
              <motion.div key={log.id} variants={staggerItem} layout>
                <LogRow log={log} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </Screen>
  );
}

function LogRow({ log }: { log: ConnectionLog }) {
  return (
    <div className="rounded-card border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            log.status === 'success' ? 'bg-success' : 'bg-error'
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{log.device}</p>
          <p className="mt-0.5 truncate font-mono text-[13px] text-txt2">
            {log.ip} · {log.location}
          </p>
        </div>
        <p className="shrink-0 text-right text-[12px] leading-tight text-txt2">
          {formatDateTime(log.timestamp)}
        </p>
      </div>
    </div>
  );
}

function JournalSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="skeleton h-[68px] w-full !rounded-card border border-white/[0.06]"
        />
      ))}
    </div>
  );
}
