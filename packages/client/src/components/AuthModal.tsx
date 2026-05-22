import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from './ui/Button.js';
import { COUNTRIES, flagEmoji } from '../lib/countries.js';
import type { SignupInput } from '../useAuth.js';

interface Props {
  initialMode: 'login' | 'signup';
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  onSignup: (input: SignupInput) => Promise<{ ok: boolean; error?: string }>;
}

const input =
  'w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40';

export function AuthModal({ initialMode, onClose, onLogin, onSignup }: Props) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res =
      mode === 'login'
        ? await onLogin(username, password)
        : await onSignup({ username, email, password, country });
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error ?? 'Something went wrong.');
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/95 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{mode === 'login' ? 'Log in' : 'Create account'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="flex flex-col gap-3" onSubmit={submit}>
          <input className={input} placeholder="Username" value={username} maxLength={20} onChange={(e) => setUsername(e.target.value)} />
          {mode === 'signup' && (
            <>
              <input className={input} type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select className={input} value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Country (optional)</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {flagEmoji(c.code)} {c.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <input className={input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" className="mt-1 w-full py-2.5" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-400">
          {mode === 'login' ? "No account?" : 'Already have one?'}{' '}
          <button
            className="font-semibold text-brand-300 hover:underline"
            onClick={() => {
              setError(null);
              setMode(mode === 'login' ? 'signup' : 'login');
            }}
          >
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>
        {mode === 'signup' && (
          <p className="mt-3 text-center text-[11px] text-zinc-500">
            Hobby project — please don't reuse an important password.
          </p>
        )}
      </motion.div>
    </div>
  );
}
