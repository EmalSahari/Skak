import { useState } from 'react';
import type { GameMode } from '@skak/shared';

const MODES: { mode: GameMode; title: string; blurb: string }[] = [
  { mode: '2p', title: '2 Players', blurb: 'Classic chess, you vs a friend.' },
  { mode: '3p', title: '3 Players', blurb: 'Three armies, free-for-all. Last king standing wins.' },
  { mode: '4p', title: '4 Players', blurb: 'Four armies on the cross board. Outlast everyone.' },
];

function hashCode(): string {
  const m = window.location.hash.match(/#\/?([A-Za-z0-9]{4})/);
  return m ? m[1].toUpperCase() : '';
}

interface Props {
  onCreate: (mode: GameMode, name: string) => void;
  onJoin: (roomId: string, name: string) => void;
}

export function Lobby({ onCreate, onJoin }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('skak.name') ?? '');
  const [mode, setMode] = useState<GameMode>('2p');
  const [code, setCode] = useState(hashCode);

  const remember = (n: string) => {
    setName(n);
    localStorage.setItem('skak.name', n);
  };

  return (
    <main className="lobby">
      <p className="tagline">Real-time online chess for two, three, or four players.</p>

      <label className="field">
        <span>Your name</span>
        <input
          value={name}
          maxLength={24}
          placeholder="e.g. Magnus"
          onChange={(e) => remember(e.target.value)}
        />
      </label>

      <section className="modes">
        {MODES.map((m) => (
          <button
            key={m.mode}
            className={`mode-card ${mode === m.mode ? 'selected' : ''}`}
            onClick={() => setMode(m.mode)}
          >
            <strong>{m.title}</strong>
            <span>{m.blurb}</span>
          </button>
        ))}
      </section>

      <div className="actions">
        <button className="primary" onClick={() => onCreate(mode, name)}>
          Create {mode.toUpperCase()} game
        </button>
      </div>

      <div className="divider">or join with a code</div>

      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length >= 3) onJoin(code.trim(), name);
        }}
      >
        <input
          value={code}
          placeholder="ABCD"
          maxLength={4}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button type="submit">Join</button>
      </form>
    </main>
  );
}
