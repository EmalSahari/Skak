import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Crown, Wifi, WifiOff } from 'lucide-react';
import type { ChatMessage, Difficulty, GameMode, Move, RoomSync, TimeControl } from '@skak/shared';
import { socket } from './socket.js';
import { Lobby } from './components/Lobby.js';
import { GameRoom } from './components/GameRoom.js';
import { useLocalGame } from './useLocalGame.js';
import { cn } from './lib/cn.js';

interface Session {
  roomId: string;
  playerId: string;
  token: string;
}

const STORAGE_KEY = 'skak.session';

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [sync, setSync] = useState<RoomSync | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const local = useLocalGame();

  const saveSession = useCallback((s: Session | null) => {
    setSession(s);
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const s = sessionRef.current;
      if (s) {
        socket.emit('room:rejoin', { roomId: s.roomId, token: s.token }, (res) => {
          if (!res.ok) {
            saveSession(null);
            setSync(null);
          }
        });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onState = (next: RoomSync) => setSync(next);
    const onError = (msg: string) => {
      setError(msg);
      setTimeout(() => setError(null), 4000);
    };
    const onChat = (msg: ChatMessage) => setChat((c) => [...c.slice(-99), msg]);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('room:error', onError);
    socket.on('room:chat', onChat);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('room:error', onError);
      socket.off('room:chat', onChat);
    };
  }, [saveSession]);

  const createRoom = useCallback(
    (mode: GameMode, name: string, timeControl: TimeControl | null) => {
      socket.emit('room:create', { mode, name, timeControl }, (res) => {
        if (res.ok && res.roomId && res.playerId && res.token) {
          saveSession({ roomId: res.roomId, playerId: res.playerId, token: res.token });
          setChat([]);
        } else setError(res.error ?? 'Could not create room');
      });
    },
    [saveSession],
  );

  const joinRoom = useCallback(
    (roomId: string, name: string) => {
      socket.emit('room:join', { roomId: roomId.toUpperCase(), name }, (res) => {
        if (res.ok && res.roomId && res.playerId && res.token) {
          saveSession({ roomId: res.roomId, playerId: res.playerId, token: res.token });
          setChat([]);
        } else setError(res.error ?? 'Could not join room');
      });
    },
    [saveSession],
  );

  const startGame = useCallback(() => {
    if (!session) return;
    socket.emit('room:start', { roomId: session.roomId }, (res) => {
      if (!res.ok) setError(res.error ?? 'Could not start');
    });
  }, [session]);

  const sendMove = useCallback(
    (move: Move) => {
      if (!session) return;
      socket.emit('game:move', { roomId: session.roomId, move }, (res) => {
        if (!res.ok) setError(res.error ?? 'Illegal move');
      });
    },
    [session],
  );

  const sendChat = useCallback(
    (text: string) => {
      if (session) socket.emit('room:chat', { roomId: session.roomId, text });
    },
    [session],
  );

  const resignGame = useCallback(() => {
    if (session) socket.emit('game:resign', { roomId: session.roomId }, () => {});
  }, [session]);

  const offerDraw = useCallback(() => {
    if (session) socket.emit('game:draw-offer', { roomId: session.roomId }, () => {});
  }, [session]);

  const respondDraw = useCallback(
    (accept: boolean) => {
      if (session) socket.emit('game:draw-respond', { roomId: session.roomId, accept }, () => {});
    },
    [session],
  );

  const requestRematch = useCallback(() => {
    if (session)
      socket.emit('room:rematch', { roomId: session.roomId }, (res) => {
        if (!res.ok) setError(res.error ?? 'Could not start rematch');
      });
  }, [session]);

  const leaveRoom = useCallback(() => {
    if (session) socket.emit('room:leave', { roomId: session.roomId });
    saveSession(null);
    setSync(null);
    setChat([]);
  }, [session, saveSession]);

  const startSolo = useCallback(
    (mode: GameMode, name: string, difficulty: Difficulty, timeControl: TimeControl | null) => {
      localStorage.setItem('skak.name', name);
      local.start(mode, name, difficulty, timeControl);
    },
    [local],
  );

  const inRoom = session && sync && sync.room.id === session.roomId;

  return (
    <div className="flex min-h-full flex-col">
      <div className="aurora" />

      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-blue-600 shadow-lg shadow-brand-600/30">
            <Crown className="h-5 w-5 text-white" />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-bold tracking-tight">Skak</h1>
            <p className="text-[11px] text-zinc-400">chess for 2, 3 &amp; 4</p>
          </div>
        </div>
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
            connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300',
          )}
        >
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {connected ? 'online' : 'connecting…'}
        </span>
      </header>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/80 px-4 py-2.5 text-sm text-red-200 shadow-xl backdrop-blur"
          >
            <AlertTriangle className="h-4 w-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {local.sync ? (
        <GameRoom
          sync={local.sync}
          playerId="you"
          chat={[]}
          onStart={() => {}}
          onMove={local.move}
          onChat={() => {}}
          onLeave={local.leave}
          onResign={local.resign}
          onRematch={local.rematch}
          local
        />
      ) : inRoom ? (
        <GameRoom
          sync={sync!}
          playerId={session!.playerId}
          chat={chat}
          onStart={startGame}
          onMove={sendMove}
          onChat={sendChat}
          onLeave={leaveRoom}
          onResign={resignGame}
          onDrawOffer={offerDraw}
          onDrawRespond={respondDraw}
          onRematch={requestRematch}
        />
      ) : (
        <Lobby onCreate={createRoom} onJoin={joinRoom} onSolo={startSolo} />
      )}
    </div>
  );
}
