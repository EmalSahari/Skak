import { useEffect, useRef, useState } from 'react';
import {
  chooseMove,
  createEngine,
  MODE_COLORS,
  MODE_PLAYERS,
  type ChessEngine,
  type ClockState,
  type Color,
  type Difficulty,
  type EngineSnapshot,
  type GameMode,
  type Move,
  type PlayerInfo,
  type RoomSync,
  type TimeControl,
} from '@skak/shared';

interface Config {
  mode: GameMode;
  human: Color;
  name: string;
  difficulty: Difficulty;
  tc: TimeControl | null;
}

function cpuName(index: number, total: number): string {
  return total > 2 ? `Computer ${index}` : 'Computer';
}

/** Drives an offline game against the built-in bot, exposed as a RoomSync. */
export function useLocalGame() {
  const engineRef = useRef<ChessEngine | null>(null);
  const cfgRef = useRef<Config | null>(null);
  const clocks = useRef<Partial<Record<Color, number>>>({});
  const active = useRef<Color | null>(null);
  const turnStart = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const onFlag = () => {
    const engine = engineRef.current;
    if (!engine || engine.result.over || !active.current) return;
    clocks.current[active.current] = 0;
    engine.endByElimination(active.current, 'timeout');
    if (engine.result.over) clearTimer();
    else armClock(engine);
    setSnapshot(engine.snapshot());
  };

  const armClock = (engine: ChessEngine) => {
    const cfg = cfgRef.current;
    if (!cfg?.tc) return;
    active.current = engine.currentColor();
    turnStart.current = Date.now();
    clearTimer();
    const ms = clocks.current[active.current];
    if (ms != null) timer.current = setTimeout(onFlag, Math.max(0, ms));
  };

  const afterTurn = () => {
    const engine = engineRef.current;
    const cfg = cfgRef.current;
    if (!engine) return;
    if (cfg?.tc) {
      const moved = active.current;
      if (moved != null && clocks.current[moved] != null) {
        clocks.current[moved] = Math.max(0, clocks.current[moved]! - (Date.now() - turnStart.current)) + cfg.tc.increment;
      }
      if (engine.result.over) clearTimer();
      else armClock(engine);
    }
    setSnapshot(engine.snapshot());
  };

  const start = (mode: GameMode, name: string, difficulty: Difficulty, tc: TimeControl | null) => {
    clearTimer();
    const engine = createEngine(mode);
    engineRef.current = engine;
    cfgRef.current = {
      mode,
      human: MODE_COLORS[mode][0],
      name: name.trim() || 'You',
      difficulty,
      tc: tc && tc.initial > 0 ? tc : null,
    };
    clocks.current = {};
    if (cfgRef.current.tc) {
      for (const c of MODE_COLORS[mode]) clocks.current[c] = cfgRef.current.tc.initial;
    }
    active.current = engine.currentColor();
    turnStart.current = Date.now();
    if (cfgRef.current.tc) armClock(engine);
    setSnapshot(engine.snapshot());
  };

  const move = (m: Move) => {
    const engine = engineRef.current;
    const cfg = cfgRef.current;
    if (!engine || !cfg || engine.currentColor() !== cfg.human) return;
    if (engine.applyMove(m)) afterTurn();
  };

  const resign = () => {
    const engine = engineRef.current;
    const cfg = cfgRef.current;
    if (!engine || !cfg || engine.result.over) return;
    engine.endByElimination(cfg.human, 'resignation');
    clearTimer();
    setSnapshot(engine.snapshot());
  };

  const rematch = () => {
    const cfg = cfgRef.current;
    if (cfg) start(cfg.mode, cfg.name, cfg.difficulty, cfg.tc);
  };

  const leave = () => {
    clearTimer();
    engineRef.current = null;
    cfgRef.current = null;
    setSnapshot(null);
  };

  // Bot turns: whenever it is not the human's move, play after a short delay.
  useEffect(() => {
    const engine = engineRef.current;
    const cfg = cfgRef.current;
    if (!engine || !cfg || !snapshot || engine.result.over) return;
    if (engine.currentColor() === cfg.human) return;
    const t = setTimeout(() => {
      const m = chooseMove(engine, engine.currentColor(), cfg.difficulty);
      if (m) engine.applyMove(m);
      afterTurn();
    }, 550);
    return () => clearTimeout(t);
  }, [snapshot]);

  let sync: RoomSync | null = null;
  const cfg = cfgRef.current;
  if (cfg && snapshot) {
    const colors = MODE_COLORS[cfg.mode];
    let cpuCount = 0;
    const players: PlayerInfo[] = colors.map((c) => {
      if (c === cfg.human) {
        return { id: 'you', name: cfg.name, color: c, connected: true, isHost: true };
      }
      cpuCount += 1;
      return { id: `cpu-${c}`, name: cpuName(cpuCount, colors.length), color: c, connected: true, isHost: false };
    });

    let clock: ClockState | null = null;
    if (cfg.tc) {
      const remaining: Partial<Record<Color, number>> = { ...clocks.current };
      const running = !snapshot.result.over;
      const act = running ? active.current : null;
      if (act && remaining[act] != null) {
        remaining[act] = Math.max(0, remaining[act]! - (Date.now() - turnStart.current));
      }
      clock = { remaining, active: act, running };
    }

    sync = {
      room: {
        id: 'SOLO',
        mode: cfg.mode,
        status: snapshot.result.over ? 'finished' : 'playing',
        capacity: MODE_PLAYERS[cfg.mode],
        players,
      },
      snapshot,
      clock,
      drawOffer: null,
    };
  }

  return { sync, start, move, resign, rematch, leave };
}
