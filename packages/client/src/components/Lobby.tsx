import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, LogIn, Sparkles } from 'lucide-react';
import type { GameMode } from '@skak/shared';
import { COLOR_HEX, MODE_COLORS } from '@skak/shared';
import { Button } from './ui/Button.js';
import { cn } from '../lib/cn.js';

const MODES: { mode: GameMode; title: string; blurb: string }[] = [
  { mode: '2p', title: '2 Players', blurb: 'Classic chess, you vs a friend.' },
  { mode: '3p', title: '3 Players', blurb: 'Three armies, free-for-all.' },
  { mode: '4p', title: '4 Players', blurb: 'Four armies on the cross board.' },
];

function hashCode(): string {
  const m = window.location.hash.match(/#\/?([A-Za-z0-9]{4})/);
  return m ? m[1].toUpperCase() : '';
}

interface Props {
  onCreate: (mode: GameMode, name: string) => void;
  onJoin: (roomId: string, name: string) => void;
}

export function Lobby({ onCreate, onJoin }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('skak.name') ?? '');
  const [mode, setMode] = useState<GameMode>('2p');
  const [code, setCode] = useState(hashCode);

  const remember = (n: string) => {
    setName(n);
    localStorage.setItem('skak.name', n);
  };

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-7 text-center"
      >
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-brand-300">
          <Sparkles className="h-3.5 w-3.5" /> real-time online chess
        </span>
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Play chess with{' '}
          <span className="bg-gradient-to-r from-brand-400 to-blue-400 bg-clip-text text-transparent">
            your friends
          </span>
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Create a room, share the code, and play with two, three, or four players.
        </p>
      </motion.div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl sm:p-6">
        <label className="mb-5 block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">Your name</span>
          <input
            value={name}
            maxLength={24}
            placeholder="e.g. Magnus"
            onChange={(e) => remember(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40"
          />
        </label>

        <span className="mb-2 block text-xs font-medium text-zinc-400">Game mode</span>
        <div className="mb-5 grid gap-2.5">
          {MODES.map((m, i) => {
            const selected = mode === m.mode;
            return (
              <motion.button
                key={m.mode}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i }}
                onClick={() => setMode(m.mode)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all',
                  selected
                    ? 'border-brand-500/70 bg-brand-500/10 ring-1 ring-brand-500/40'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]',
                )}
              >
                <div className="flex -space-x-1.5">
                  {MODE_COLORS[m.mode].map((c) => (
                    <span
                      key={c}
                      className="h-6 w-6 rounded-full border-2 border-black/40"
                      style={{ background: COLOR_HEX[c] }}
                    />
                  ))}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{m.title}</div>
                  <div className="text-xs text-zinc-400">{m.blurb}</div>
                </div>
                <span
                  className={cn(
                    'h-4 w-4 rounded-full border-2 transition',
                    selected ? 'border-brand-400 bg-brand-400' : 'border-white/25',
                  )}
                />
              </motion.button>
            );
          })}
        </div>

        <Button className="w-full py-3" onClick={() => onCreate(mode, name)}>
          Create {mode.toUpperCase()} game <ArrowRight className="h-4 w-4" />
        </Button>

        <div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
          <span className="h-px flex-1 bg-white/10" />
          or join with a code
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 3) onJoin(code.trim(), name);
          }}
        >
          <input
            value={code}
            placeholder="ABCD"
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-center text-lg font-bold uppercase tracking-[0.4em] outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40"
          />
          <Button type="submit" variant="subtle" className="px-5">
            <LogIn className="h-4 w-4" /> Join
          </Button>
        </form>
      </div>
    </main>
  );
}
