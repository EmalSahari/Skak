import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

type Variant = 'primary' | 'ghost' | 'subtle';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-brand-500 to-blue-600 text-white shadow-lg shadow-brand-600/30 hover:brightness-110 disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-400 disabled:shadow-none',
  ghost: 'bg-transparent text-zinc-300 border border-white/10 hover:bg-white/5',
  subtle: 'bg-white/5 text-zinc-100 border border-white/10 hover:bg-white/10',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className, ...props }: Props) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
        'transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
    />
  );
}
