import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Check, Copy, Crown, Flag, Handshake, Loader, LogOut, Play, RotateCcw, Send, Sparkles } from 'lucide-react';
import type { Color, ChatMessage, Move, ReviewReq, RoomSync } from '@skak/shared';
import { COLOR_HEX, COLOR_NAMES } from '@skak/shared';
import { Board } from './Board.js';
import { Clock } from './Clock.js';
import { ReviewModal } from './ReviewModal.js';
import { Button } from './ui/Button.js';
import { buildTranscript, moveLabel } from '../lib/format.js';
import { flagEmoji } from '../lib/countries.js';
import { cn } from '../lib/cn.js';

interface Props {
  sync: RoomSync;
  playerId: string;
  chat: ChatMessage[];
  onStart: () => void;
  onMove: (move: Move) => void;
  onChat: (text: string) => void;
  onLeave: () => void;
  onResign: () => void;
  onRematch: () => void;
  onDrawOffer?: () => void;
  onDrawRespond?: (accept: boolean) => void;
  local?: boolean;
  coachEnabled?: boolean;
}

export function GameRoom({
  sync,
  playerId,
  chat,
  onStart,
  onMove,
  onChat,
  onLeave,
  onResign,
  onRematch,
  onDrawOffer,
  onDrawRespond,
  local = false,
  coachEnabled = false,
}: Props) {
  const { room, snapshot, clock, drawOffer } = sync;
  const me = room.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const myColor = me?.color ?? null;
  const waiting = room.status === 'waiting';
  const playing = room.status === 'playing';

  const turnColor = snapshot ? snapshot.colors[snapshot.turnIndex] : null;
  const playerByColor = (color: string) => room.players.find((p) => p.color === color);

  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const reviewPayload = (): ReviewReq => ({
    mode: room.mode,
    result: statusLine(),
    players: room.players
      .filter((p): p is typeof p & { color: Color } => p.color !== null)
      .map((p) => ({ name: p.name, color: p.color })),
    transcript: snapshot ? buildTranscript(snapshot.history, snapshot.size, room.mode) : '',
  });

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [chat]);

  const copyCode = () => {
    const url = `${window.location.origin}/#/${room.id}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const statusLine = () => {
    if (!snapshot) return 'Waiting to start…';
    if (snapshot.result.over) {
      if (snapshot.result.winner) {
        const w = playerByColor(snapshot.result.winner);
        return `${COLOR_NAMES[snapshot.result.winner]}${w ? ` (${w.name})` : ''} wins · ${snapshot.result.reason}`;
      }
      return `Draw · ${snapshot.result.reason}`;
    }
    const turnPlayer = turnColor ? playerByColor(turnColor) : null;
    const inCheck = turnColor ? snapshot.checks.includes(turnColor) : false;
    const who =
      turnColor === myColor
        ? 'Your move'
        : `${turnPlayer?.name ?? (turnColor ? COLOR_NAMES[turnColor] : '')} to move`;
    return inCheck ? `${who} — check!` : who;
  };

  const over = snapshot?.result.over ?? false;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:items-start">
      {/* ---------- Side panel ---------- */}
      <aside className="flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl backdrop-blur-xl lg:w-80 lg:shrink-0">
        {local ? (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <Bot className="h-5 w-5 text-brand-300" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">Single player</div>
              <div className="text-sm font-semibold">vs Computer</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">Room code</div>
              <div className="text-xl font-bold tracking-[0.3em]">{room.id}</div>
            </div>
            <Button variant="subtle" className="px-3 py-2 text-xs" onClick={copyCode}>
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
            {room.mode.toUpperCase()} game
          </span>
          {waiting && (
            <span className="text-xs text-zinc-400">
              {room.players.length}/{room.capacity} joined
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-1.5">
          {room.players.map((p) => {
            const out = p.color && snapshot?.eliminated.includes(p.color);
            const active = turnColor && p.color === turnColor && !over;
            return (
              <li
                key={p.id}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition',
                  active
                    ? 'border-brand-500/60 bg-brand-500/10'
                    : 'border-white/10 bg-white/[0.02]',
                  out && 'opacity-40',
                )}
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/40"
                  style={{ background: p.color ? COLOR_HEX[p.color] : '#71717a' }}
                />
                {p.country && <span title={p.country}>{flagEmoji(p.country)}</span>}
                <span className="flex-1 truncate">
                  {p.name}
                  {p.rating != null && <span className="ml-1 font-mono text-[11px] text-zinc-500">{p.rating}</span>}
                  {p.id === playerId && <span className="text-zinc-500"> (you)</span>}
                </span>
                {p.isHost && <Crown className="h-3.5 w-3.5 text-amber-400" />}
                {clock && p.color && clock.remaining[p.color] != null ? (
                  <Clock
                    ms={clock.remaining[p.color]!}
                    active={clock.running && clock.active === p.color}
                  />
                ) : (
                  <span className="text-[11px] text-zinc-400">
                    {out
                      ? 'out'
                      : !p.connected
                        ? 'offline'
                        : p.color
                          ? COLOR_NAMES[p.color]
                          : ''}
                  </span>
                )}
              </li>
            );
          })}
          {waiting &&
            Array.from({ length: room.capacity - room.players.length }).map((_, i) => (
              <li
                key={`e-${i}`}
                className="flex items-center gap-2.5 rounded-xl border border-dashed border-white/10 px-3 py-2 text-sm text-zinc-500"
              >
                <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-white/10" />
                waiting for player…
              </li>
            ))}
        </ul>

        <div
          className={cn(
            'rounded-xl border px-3 py-2.5 text-sm font-semibold',
            over
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              : 'border-brand-500/20 bg-brand-500/5 text-brand-200',
          )}
        >
          {statusLine()}
        </div>

        {local && playing && turnColor && turnColor !== myColor && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader className="h-3.5 w-3.5 animate-spin" /> Computer is thinking…
          </div>
        )}

        {drawOffer && drawOffer !== myColor && onDrawRespond && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <p className="mb-2 text-amber-200">Draw offered.</p>
            <div className="flex gap-2">
              <Button className="flex-1 py-2" onClick={() => onDrawRespond(true)}>
                Accept
              </Button>
              <Button variant="ghost" className="flex-1 py-2" onClick={() => onDrawRespond(false)}>
                Decline
              </Button>
            </div>
          </div>
        )}

        {playing && myColor && !snapshot?.eliminated.includes(myColor) && (
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1 py-2 text-xs" onClick={onResign}>
              <Flag className="h-3.5 w-3.5" /> Resign
            </Button>
            {!local && room.mode === '2p' && onDrawOffer && (
              <Button
                variant="ghost"
                className="flex-1 py-2 text-xs"
                disabled={drawOffer === myColor}
                onClick={onDrawOffer}
              >
                <Handshake className="h-3.5 w-3.5" />
                {drawOffer === myColor ? 'Offered' : 'Offer draw'}
              </Button>
            )}
          </div>
        )}

        {snapshot && snapshot.history.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-2">
            <div className="scroll-thin flex max-h-24 flex-wrap gap-x-2 gap-y-1 overflow-y-auto text-xs">
              {snapshot.history.map((rec, i) => (
                <span key={i} className="font-mono">
                  <span className="text-zinc-600">{i + 1}.</span>{' '}
                  <span style={{ color: COLOR_HEX[rec.color] }}>
                    {moveLabel(rec, snapshot.size)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {waiting && (
          <Button
            disabled={!isHost || room.players.length < 2}
            onClick={onStart}
            className="w-full py-3"
          >
            <Play className="h-4 w-4" />
            {room.players.length < 2
              ? `Need ${2 - room.players.length} more`
              : !isHost
                ? 'Waiting for host'
                : room.players.length < room.capacity
                  ? `Start now (${room.players.length}/${room.capacity})`
                  : 'Start game'}
          </Button>
        )}

        {/* Chat */}
        <div className={cn('mt-auto border-t border-white/10 pt-3', local && 'hidden')}>
          <div ref={logRef} className="scroll-thin mb-2 flex h-32 flex-col gap-1 overflow-y-auto text-sm">
            {chat.length === 0 && <p className="text-xs text-zinc-500">No messages yet.</p>}
            {chat.map((m, i) => (
              <div key={i} className="text-zinc-300">
                <b className="text-brand-300">{m.from}:</b> {m.text}
              </div>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) {
                onChat(draft);
                setDraft('');
              }
            }}
          >
            <input
              value={draft}
              placeholder="Say something…"
              maxLength={300}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <Button type="submit" variant="subtle" className="px-3">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>

        <button
          onClick={onLeave}
          className="flex items-center justify-center gap-2 text-xs text-zinc-500 transition hover:text-zinc-300"
        >
          <LogOut className="h-3.5 w-3.5" /> {local ? 'Quit to lobby' : 'Leave room'}
        </button>
      </aside>

      {/* ---------- Stage ---------- */}
      <div className="flex flex-1 items-start justify-center">
        {snapshot ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative rounded-2xl border border-white/10 bg-black/20 p-2 shadow-2xl sm:p-3"
          >
            <Board snapshot={snapshot} myColor={myColor} onMove={onMove} />
            <AnimatePresence>
              {over && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 backdrop-blur-sm"
                >
                  <motion.div
                    initial={{ scale: 0.8, y: 10 }}
                    animate={{ scale: 1, y: 0 }}
                    className="rounded-2xl border border-white/10 bg-zinc-900/90 px-8 py-6 text-center shadow-2xl"
                  >
                    <Crown className="mx-auto mb-2 h-8 w-8 text-amber-400" />
                    <p className="text-lg font-bold">{statusLine()}</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button onClick={onRematch}>
                        <RotateCcw className="h-4 w-4" /> Rematch
                      </Button>
                      <Button variant="subtle" onClick={onLeave}>
                        Lobby
                      </Button>
                    </div>
                    {coachEnabled && snapshot.history.length > 1 && (
                      <button
                        onClick={() => setShowReview(true)}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-300 hover:underline"
                      >
                        <Sparkles className="h-4 w-4" /> Review game with AI coach
                      </button>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="mt-6 max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-sm text-zinc-400">Share this code to invite players</p>
            <p className="my-3 text-5xl font-bold tracking-[0.3em] text-white">{room.id}</p>
            <p className="mb-4 text-3xl font-bold text-brand-300">
              {room.players.length}
              <span className="text-zinc-500">/{room.capacity}</span>
            </p>
            <p className="text-sm text-zinc-400">
              Starts automatically when all {room.capacity} seats are filled
              {isHost
                ? room.players.length >= 2
                  ? ' — or tap “Start now”.'
                  : ' — start once a second player joins.'
                : '.'}
            </p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showReview && <ReviewModal payload={reviewPayload()} onClose={() => setShowReview(false)} />}
      </AnimatePresence>
    </div>
  );
}
