import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { PublicUser } from '@skak/shared';
import { flagEmoji } from '../lib/countries.js';

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

export function ProfileModal({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  const games2 = user.w2 + user.l2 + user.d2;
  const winRate = games2 ? Math.round((user.w2 / games2) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/95 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{flagEmoji(user.country)}</span>
            <h2 className="text-lg font-bold">{user.username}</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <Stat label="Elo rating" value={user.elo} />
          <Stat label="2P win rate" value={`${winRate}%`} sub={`${games2} games`} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="2P W/L/D" value={`${user.w2}/${user.l2}/${user.d2}`} />
          <Stat label="3P wins" value={user.won3} sub={`${user.played3} played`} />
          <Stat label="4P wins" value={user.won4} sub={`${user.played4} played`} />
        </div>
      </motion.div>
    </div>
  );
}
