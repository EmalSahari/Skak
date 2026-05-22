import pg from 'pg';
import {
  applyElo,
  DEFAULT_ELO,
  type EloEntry,
  type Leaderboard,
  type PublicUser,
  type WinsEntry,
} from '@skak/shared';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
    })
  : null;

export const dbEnabled = !!pool;

const PUBLIC_COLUMNS = 'id, username, country, elo, w2, l2, d2, played3, won3, played4, won4';

export async function initDb(): Promise<void> {
  if (!pool) {
    console.warn('DATABASE_URL not set — accounts, ratings, and leaderboards are disabled.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL,
      username_lc   TEXT NOT NULL UNIQUE,
      email         TEXT,
      password_hash TEXT NOT NULL,
      country       TEXT,
      elo           INTEGER NOT NULL DEFAULT ${DEFAULT_ELO},
      w2            INTEGER NOT NULL DEFAULT 0,
      l2            INTEGER NOT NULL DEFAULT 0,
      d2            INTEGER NOT NULL DEFAULT 0,
      played3       INTEGER NOT NULL DEFAULT 0,
      won3          INTEGER NOT NULL DEFAULT 0,
      played4       INTEGER NOT NULL DEFAULT 0,
      won4          INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('Database ready.');
}

interface UserRow extends PublicUser {
  password_hash: string;
}

function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    country: row.country,
    elo: row.elo,
    w2: row.w2,
    l2: row.l2,
    d2: row.d2,
    played3: row.played3,
    won3: row.won3,
    played4: row.played4,
    won4: row.won4,
  };
}

export async function createUser(
  username: string,
  email: string | null,
  passwordHash: string,
  country: string | null,
): Promise<PublicUser> {
  const res = await pool!.query(
    `INSERT INTO users (username, username_lc, email, password_hash, country)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${PUBLIC_COLUMNS}`,
    [username, username.toLowerCase(), email, passwordHash, country],
  );
  return toPublic(res.rows[0]);
}

export async function findByUsername(username: string): Promise<UserRow | null> {
  const res = await pool!.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE username_lc = $1`,
    [username.toLowerCase()],
  );
  return res.rows[0] ?? null;
}

export async function findById(id: number): Promise<PublicUser | null> {
  const res = await pool!.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return res.rows[0] ? toPublic(res.rows[0]) : null;
}

export async function usernameTaken(username: string): Promise<boolean> {
  const res = await pool!.query('SELECT 1 FROM users WHERE username_lc = $1', [
    username.toLowerCase(),
  ]);
  return res.rowCount! > 0;
}

/** Apply a finished 2-player rated game's Elo change to both players. */
export async function recordEloResult(
  winnerId: number | null,
  loserId: number | null,
  drawIds: [number, number] | null,
): Promise<void> {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (drawIds) {
      const [aId, bId] = drawIds;
      const a = (await client.query('SELECT elo FROM users WHERE id = $1', [aId])).rows[0]?.elo;
      const b = (await client.query('SELECT elo FROM users WHERE id = $1', [bId])).rows[0]?.elo;
      if (a != null && b != null) {
        const next = applyElo(a, b, 'draw');
        await client.query('UPDATE users SET elo = $1, d2 = d2 + 1 WHERE id = $2', [next.a, aId]);
        await client.query('UPDATE users SET elo = $1, d2 = d2 + 1 WHERE id = $2', [next.b, bId]);
      }
    } else if (winnerId != null && loserId != null) {
      const w = (await client.query('SELECT elo FROM users WHERE id = $1', [winnerId])).rows[0]?.elo;
      const l = (await client.query('SELECT elo FROM users WHERE id = $1', [loserId])).rows[0]?.elo;
      if (w != null && l != null) {
        const next = applyElo(w, l, 'a');
        await client.query('UPDATE users SET elo = $1, w2 = w2 + 1 WHERE id = $2', [next.a, winnerId]);
        await client.query('UPDATE users SET elo = $1, l2 = l2 + 1 WHERE id = $2', [next.b, loserId]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('recordEloResult failed', err);
  } finally {
    client.release();
  }
}

/** Count a finished 3p/4p game for a player (and a win if they won). */
export async function recordMultiplayerResult(
  userId: number,
  mode: '3p' | '4p',
  won: boolean,
): Promise<void> {
  if (!pool) return;
  const played = mode === '3p' ? 'played3' : 'played4';
  const wonCol = mode === '3p' ? 'won3' : 'won4';
  await pool.query(
    `UPDATE users SET ${played} = ${played} + 1, ${wonCol} = ${wonCol} + ($1::int) WHERE id = $2`,
    [won ? 1 : 0, userId],
  );
}

export async function leaderboard(): Promise<Leaderboard> {
  if (!pool) return { elo: [], wins: [] };
  const eloRes = await pool.query(
    `SELECT username, country, elo, (w2 + l2 + d2) AS games
     FROM users WHERE (w2 + l2 + d2) > 0
     ORDER BY elo DESC LIMIT 50`,
  );
  const winsRes = await pool.query(
    `SELECT username, country, (won3 + won4) AS wins, (played3 + played4) AS games
     FROM users WHERE (played3 + played4) > 0
     ORDER BY wins DESC, games ASC LIMIT 50`,
  );
  return {
    elo: eloRes.rows as EloEntry[],
    wins: winsRes.rows as WinsEntry[],
  };
}
