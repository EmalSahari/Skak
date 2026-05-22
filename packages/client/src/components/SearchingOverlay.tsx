import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader, Users } from 'lucide-react';
import type { GameMode, MatchStatus } from '@skak/shared';
import { Button } from './ui/Button.js';

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

export function SearchingOverlay({
  mode,
  status,
  onCancel,
}: {
  mode: GameMode;
  status: MatchStatus | null;
  onCancel: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const need = mode === '2p' ? 2 : mode === '3p' ? 3 : 4;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/95 p-7 text-center shadow-2xl"
      >
        <Loader className="mx-auto mb-4 h-10 w-10 animate-spin text-brand-400" />
        <h2 className="text-lg font-bold">Finding a {mode.toUpperCase()} opponent…</h2>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-zinc-400">
          <Users className="h-4 w-4" />
          {status ? `${status.waiting}/${need} in queue` : 'joining queue…'}
        </p>
        <div className="mt-4 flex justify-center gap-6 text-sm">
          <div>
            <div className="font-mono text-xl">{fmt(elapsed)}</div>
            <div className="text-[11px] text-zinc-500">elapsed</div>
          </div>
          <div>
            <div className="font-mono text-xl">~{fmt(status?.estimateSec ?? 0)}</div>
            <div className="text-[11px] text-zinc-500">est. wait</div>
          </div>
        </div>
        <Button variant="ghost" className="mt-6 w-full" onClick={onCancel}>
          Cancel
        </Button>
        <p className="mt-3 text-[11px] text-zinc-500">Estimate is approximate and depends on who's online.</p>
      </motion.div>
    </div>
  );
}
