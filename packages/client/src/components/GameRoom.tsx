import { useState } from 'react';
import type { ChatMessage, Move, RoomSync } from '@skak/shared';
import { COLOR_HEX, COLOR_NAMES } from '@skak/shared';
import { Board } from './Board.js';

interface Props {
  sync: RoomSync;
  playerId: string;
  chat: ChatMessage[];
  onStart: () => void;
  onMove: (move: Move) => void;
  onChat: (text: string) => void;
  onLeave: () => void;
}

export function GameRoom({ sync, playerId, chat, onStart, onMove, onChat, onLeave }: Props) {
  const { room, snapshot } = sync;
  const me = room.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const myColor = me?.color ?? null;

  const turnColor = snapshot ? snapshot.colors[snapshot.turnIndex] : null;
  const playerByColor = (color: string) => room.players.find((p) => p.color === color);

  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

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
        return `${COLOR_NAMES[snapshot.result.winner]}${w ? ` (${w.name})` : ''} wins — ${snapshot.result.reason}`;
      }
      return `Draw — ${snapshot.result.reason}`;
    }
    const turnPlayer = turnColor ? playerByColor(turnColor) : null;
    const inCheck = turnColor ? snapshot.checks.includes(turnColor) : false;
    const who =
      turnColor === myColor
        ? 'Your move'
        : `${turnPlayer?.name ?? (turnColor ? COLOR_NAMES[turnColor] : '')} to move`;
    return inCheck ? `${who} — check!` : who;
  };

  return (
    <div className="room">
      <aside className="panel">
        <div className="room-code">
          <span>Room</span>
          <strong>{room.id}</strong>
          <button onClick={copyCode}>{copied ? 'Copied!' : 'Copy link'}</button>
        </div>

        <div className="mode-pill">{room.mode.toUpperCase()} game</div>

        <ul className="players">
          {room.players.map((p) => (
            <li key={p.id} className={turnColor && p.color === turnColor ? 'active' : ''}>
              <span className="dot" style={{ background: p.color ? COLOR_HEX[p.color] : '#888' }} />
              <span className="pname">
                {p.name}
                {p.id === playerId ? ' (you)' : ''}
                {p.isHost ? ' ★' : ''}
              </span>
              <span className="pstatus">
                {p.color && snapshot?.eliminated.includes(p.color)
                  ? 'out'
                  : p.connected
                    ? p.color
                      ? COLOR_NAMES[p.color]
                      : ''
                    : 'offline'}
              </span>
            </li>
          ))}
          {room.status === 'waiting' &&
            Array.from({ length: room.capacity - room.players.length }).map((_, i) => (
              <li key={`empty-${i}`} className="empty">
                <span className="dot" />
                <span className="pname">waiting for player…</span>
              </li>
            ))}
        </ul>

        {room.status === 'waiting' && (
          <p className="counter">
            {room.players.length}/{room.capacity} players joined
          </p>
        )}

        <p className="status">{statusLine()}</p>

        {room.status === 'waiting' && (
          <button
            className="primary"
            disabled={!isHost || room.players.length < 2}
            onClick={onStart}
          >
            {room.players.length < 2
              ? `Need ${2 - room.players.length} more`
              : !isHost
                ? 'Waiting for host'
                : room.players.length < room.capacity
                  ? `Start now (${room.players.length}/${room.capacity})`
                  : 'Start game'}
          </button>
        )}

        <button className="leave" onClick={onLeave}>
          Leave room
        </button>

        <div className="chat">
          <div className="chat-log">
            {chat.map((m, i) => (
              <div key={i} className="chat-msg">
                <b>{m.from}:</b> {m.text}
              </div>
            ))}
          </div>
          <form
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
            />
          </form>
        </div>
      </aside>

      <div className="stage">
        {snapshot ? (
          <Board snapshot={snapshot} myColor={myColor} onMove={onMove} />
        ) : (
          <div className="waiting-stage">
            <h2>Share the code to invite players</h2>
            <p className="bigcode">{room.id}</p>
            <p className="counter big">
              {room.players.length}/{room.capacity} joined
            </p>
            <p>
              Starts automatically when all {room.capacity} seats are filled
              {isHost
                ? room.players.length >= 2
                  ? ' — or tap “Start now” to begin with who’s here.'
                  : ' — you can start once a second player joins.'
                : '.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
