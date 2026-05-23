import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, X } from 'lucide-react';
import type { Leaderboard as LeaderboardData } from '@skak/shared';
import { apiGet } from '../api.js';
import { flagEmoji } from '../lib/countries.js';
import { ProBadge } from './ProBadge.js';
import { cn } from '../lib/cn.js';

export function Leaderboard({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [tab, setTab] = useState<'elo' | 'wins'>('elo');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiGet<LeaderboardData>('/api/leaderboard')
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const rows = data?.[tab] ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-white/10 bg-zinc-900/95 p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Trophy className="h-5 w-5 text-amber-400" /> Leaderboard
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
          {(
            [
              { v: 'elo', label: '2-Player Elo' },
              { v: 'wins', label: '3p/4p Wins' },
            ] as const
          ).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={cn(
                'rounded-lg py-2 text-sm font-medium transition',
                tab === v ? 'bg-brand-500/20 text-white' : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto">
          {failed && <p className="py-8 text-center text-sm text-zinc-500">Could not load the leaderboard.</p>}
          {!failed && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              No ranked games yet — play some {tab === 'elo' ? '2-player' : '3p/4p'} games!
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {rows.map((row, i) => (
              <li
                key={row.username}
                className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
              >
                <span className={cn('w-6 text-center font-bold', i < 3 ? 'text-amber-400' : 'text-zinc-500')}>
                  {i + 1}
                </span>
                <span className="text-lg">{flagEmoji(row.country)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate font-medium">{row.username}</span>
                  {row.pro && <ProBadge />}
                </span>
                {'elo' in row ? (
                  <span className="font-mono font-semibold text-brand-300">{row.elo}</span>
                ) : (
                  <span className="font-mono font-semibold text-brand-300">{row.wins}🏆</span>
                )}
                <span className="w-12 text-right text-xs text-zinc-500">{row.games}g</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
