import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader, Sparkles, X } from 'lucide-react';
import type { ReviewReq, ReviewRes } from '@skak/shared';
import { apiPost } from '../api.js';

export function ReviewModal({ payload, onClose }: { payload: ReviewReq; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiPost<ReviewRes>('/api/review', payload)
      .then((res) => {
        if (!active) return;
        if (res.ok && res.text) setText(res.text);
        else setError(res.error ?? 'Could not generate a review.');
      })
      .catch(() => active && setError('Could not reach the coach.'));
    return () => {
      active = false;
    };
  }, [payload]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-white/10 bg-zinc-900/95 p-6 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-brand-300" /> Game review
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="scroll-thin overflow-y-auto">
          {!text && !error && (
            <div className="flex flex-col items-center gap-3 py-10 text-zinc-400">
              <Loader className="h-7 w-7 animate-spin text-brand-400" />
              <p className="text-sm">The coach is reviewing your game…</p>
            </div>
          )}
          {error && <p className="py-6 text-center text-sm text-zinc-400">{error}</p>}
          {text && <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{text}</p>}
        </div>

        {text && (
          <p className="mt-4 text-center text-[11px] text-zinc-500">AI-generated — may contain mistakes.</p>
        )}
      </motion.div>
    </div>
  );
}
