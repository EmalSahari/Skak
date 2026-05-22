import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../lib/format.js';
import { cn } from '../lib/cn.js';

/** A countdown badge that ticks the active player's clock locally between syncs. */
export function Clock({ ms, active }: { ms: number; active: boolean }) {
  const [display, setDisplay] = useState(ms);
  const base = useRef({ ms, at: Date.now() });

  // Resync whenever the server-provided value or active flag changes.
  useEffect(() => {
    base.current = { ms, at: Date.now() };
    setDisplay(ms);
  }, [ms, active]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setDisplay(Math.max(0, base.current.ms - (Date.now() - base.current.at)));
    }, 200);
    return () => clearInterval(id);
  }, [active]);

  const low = display < 20000;
  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 font-mono text-sm tabular-nums',
        active ? 'bg-white/15 text-white' : 'bg-black/20 text-zinc-400',
        low && active && 'bg-red-500/20 text-red-300',
      )}
    >
      {formatClock(display)}
    </span>
  );
}
