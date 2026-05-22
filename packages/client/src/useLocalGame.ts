import { useCallback, useEffect, useRef, useState } from 'react';
import {
  chooseMove,
  createEngine,
  MODE_COLORS,
  MODE_PLAYERS,
  type ChessEngine,
  type Color,
  type Difficulty,
  type EngineSnapshot,
  type GameMode,
  type Move,
  type PlayerInfo,
  type RoomSync,
} from '@skak/shared';

interface Config {
  mode: GameMode;
  human: Color;
  name: string;
  difficulty: Difficulty;
}

function cpuName(index: number, total: number): string {
  return total > 2 ? `Computer ${index}` : 'Computer';
}

/** Drives an offline game against the built-in bot, exposed as a RoomSync. */
export function useLocalGame() {
  const engineRef = useRef<ChessEngine | null>(null);
  const cfgRef = useRef<Config | null>(null);
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);

  const start = useCallback((mode: GameMode, name: string, difficulty: Difficulty) => {
    const engine = createEngine(mode);
    engineRef.current = engine;
    cfgRef.current = { mode, human: MODE_COLORS[mode][0], name: name.trim() || 'You', difficulty };
    setSnapshot(engine.snapshot());
  }, []);

  const move = useCallback((m: Move) => {
    const engine = engineRef.current;
    const cfg = cfgRef.current;
    if (!engine || !cfg || engine.currentColor() !== cfg.human) return;
    if (engine.applyMove(m)) setSnapshot(engine.snapshot());
  }, []);

  const leave = useCallback(() => {
    engineRef.current = null;
    cfgRef.current = null;
    setSnapshot(null);
  }, []);

  // Bot turns: whenever it is not the human's move, play after a short delay.
  useEffect(() => {
    const engine = engineRef.current;
    const cfg = cfgRef.current;
    if (!engine || !cfg || !snapshot || engine.result.over) return;
    if (engine.currentColor() === cfg.human) return;
    const timer = setTimeout(() => {
      const m = chooseMove(engine, engine.currentColor(), cfg.difficulty);
      if (m) engine.applyMove(m);
      setSnapshot(engine.snapshot());
    }, 550);
    return () => clearTimeout(timer);
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
      return {
        id: `cpu-${c}`,
        name: cpuName(cpuCount, colors.length),
        color: c,
        connected: true,
        isHost: false,
      };
    });
    sync = {
      room: {
        id: 'SOLO',
        mode: cfg.mode,
        status: snapshot.result.over ? 'finished' : 'playing',
        capacity: MODE_PLAYERS[cfg.mode],
        players,
      },
      snapshot,
    };
  }

  return { sync, start, move, leave };
}
