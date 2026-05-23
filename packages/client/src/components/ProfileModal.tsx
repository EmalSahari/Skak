import { useState } from 'react';
import { motion } from 'framer-motion';
import { Palette, Settings, Sparkles, X } from 'lucide-react';
import type { PublicUser } from '@skak/shared';
import { BOARD_THEMES } from '@skak/shared';
import { flagEmoji } from '../lib/countries.js';
import { Button } from './ui/Button.js';
import { ProBadge } from './ProBadge.js';
import { cn } from '../lib/cn.js';

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

interface Props {
  user: PublicUser;
  onClose: () => void;
  onUpgrade: () => Promise<{ ok: boolean; error?: string }>;
  onManage: () => Promise<{ ok: boolean; error?: string }>;
  onTheme: (theme: string | null) => Promise<{ ok: boolean; error?: string }>;
}

export function ProfileModal({ user, onClose, onUpgrade, onManage, onTheme }: Props) {
  const games2 = user.w2 + user.l2 + user.d2;
  const winRate = games2 ? Math.round((user.w2 / games2) * 100) : 0;
  const [billingMsg, setBillingMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upgrade = async () => {
    setBusy(true);
    const res = await onUpgrade();
    setBusy(false);
    if (!res.ok) setBillingMsg(res.error ?? 'Could not start checkout.');
  };

  const manage = async () => {
    setBusy(true);
    const res = await onManage();
    setBusy(false);
    if (!res.ok) setBillingMsg(res.error ?? 'Could not open billing portal.');
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-sm flex-col overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/95 p-6 shadow-2xl scroll-thin"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{flagEmoji(user.country)}</span>
            <h2 className="text-lg font-bold">{user.username}</h2>
            {user.pro && <ProBadge />}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <Stat label="Elo rating" value={user.elo} />
          <Stat label="2P win rate" value={`${winRate}%`} sub={`${games2} games`} />
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="2P W/L/D" value={`${user.w2}/${user.l2}/${user.d2}`} />
          <Stat label="3P wins" value={user.won3} sub={`${user.played3} played`} />
          <Stat label="4P wins" value={user.won4} sub={`${user.played4} played`} />
        </div>

        {/* ---------- Skak Pro ---------- */}
        {user.pro ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
              <Sparkles className="h-4 w-4" /> You're on Skak Pro
            </div>
            <p className="mb-3 text-xs text-amber-100/80">Unlimited AI coach reviews, custom board themes, and a PRO badge.</p>
            <Button variant="subtle" className="w-full text-xs" disabled={busy} onClick={manage}>
              <Settings className="h-3.5 w-3.5" /> Manage subscription
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-blue-500/10 p-3.5">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-200">
              <Sparkles className="h-4 w-4" /> Upgrade to Skak Pro
            </div>
            <p className="mb-3 text-xs text-zinc-300">
              <b>$5/month.</b> Unlimited AI coach reviews, custom board themes, and a PRO badge on
              the leaderboard.
            </p>
            <Button className="w-full" disabled={busy} onClick={upgrade}>
              {busy ? 'Opening checkout…' : 'Upgrade to Pro'}
            </Button>
          </div>
        )}

        {billingMsg && <p className="mt-2 text-center text-xs text-zinc-400">{billingMsg}</p>}

        {/* ---------- Board theme (Pro) ---------- */}
        {user.pro && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Palette className="h-3.5 w-3.5" /> Board theme
            </div>
            <div className="grid grid-cols-5 gap-2">
              {BOARD_THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => onTheme(t)}
                  className={cn(
                    'aspect-square rounded-lg border-2 capitalize transition',
                    user.boardTheme === t || (!user.boardTheme && t === 'classic')
                      ? 'border-brand-400 ring-2 ring-brand-400/40'
                      : 'border-white/10 hover:border-white/30',
                  )}
                  title={t}
                >
                  <div className="grid h-full w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-md" data-theme={t}>
                    <span className="bg-[var(--sq-light)]" />
                    <span className="bg-[var(--sq-dark)]" />
                    <span className="bg-[var(--sq-dark)]" />
                    <span className="bg-[var(--sq-light)]" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
