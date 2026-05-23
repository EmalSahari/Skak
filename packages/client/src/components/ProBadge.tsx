import { cn } from '../lib/cn.js';

export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-black',
        className,
      )}
      title="Skak Pro subscriber"
    >
      Pro
    </span>
  );
}
