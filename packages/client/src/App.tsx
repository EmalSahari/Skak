import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, GameMode, Move, RoomSync } from '@skak/shared';
import { socket } from './socket.js';
import { Lobby } from './components/Lobby.js';
import { GameRoom } from './components/GameRoom.js';

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
    (mode: GameMode, name: string) => {
      socket.emit('room:create', { mode, name }, (res) => {
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

  const leaveRoom = useCallback(() => {
    if (session) socket.emit('room:leave', { roomId: session.roomId });
    saveSession(null);
    setSync(null);
    setChat([]);
  }, [session, saveSession]);

  const inRoom = session && sync && sync.room.id === session.roomId;

  return (
    <div className="app">
      <header className="topbar">
        <h1>♞ Skak</h1>
        <span className={`conn ${connected ? 'on' : 'off'}`}>
          {connected ? 'online' : 'connecting…'}
        </span>
      </header>

      {error && <div className="toast">{error}</div>}

      {inRoom ? (
        <GameRoom
          sync={sync!}
          playerId={session!.playerId}
          chat={chat}
          onStart={startGame}
          onMove={sendMove}
          onChat={sendChat}
          onLeave={leaveRoom}
        />
      ) : (
        <Lobby onCreate={createRoom} onJoin={joinRoom} />
      )}
    </div>
  );
}
