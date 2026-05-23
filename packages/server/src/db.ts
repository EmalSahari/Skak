import pg from 'pg';
import {
  applyElo,
  BOARD_THEMES,
  type BoardTheme,
  DEFAULT_ELO,
  type EloEntry,
  FREE_REVIEWS_PER_DAY,
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

const PUBLIC_COLUMNS =
  'id, username, country, elo, w2, l2, d2, played3, won3, played4, won4, pro_until, board_theme';

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
  // Subscription / monetization columns, added incrementally so existing rows keep working.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_until           TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id  TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS board_theme         TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reviews_date        DATE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reviews_today       INTEGER NOT NULL DEFAULT 0;`);
  console.log('Database ready.');
}

interface UserRow {
  id: number;
  username: string;
  country: string | null;
  elo: number;
  w2: number;
  l2: number;
  d2: number;
  played3: number;
  won3: number;
  played4: number;
  won4: number;
  pro_until: Date | null;
  board_theme: string | null;
  password_hash?: string;
}

function isPro(proUntil: Date | null): boolean {
  return !!proUntil && proUntil.getTime() > Date.now();
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
    pro: isPro(row.pro_until),
    boardTheme: row.board_theme,
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

export async function findByUsername(
  username: string,
): Promise<(UserRow & { password_hash: string }) | null> {
  const res = await pool!.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE username_lc = $1`,
    [username.toLowerCase()],
  );
  return res.rows[0] ?? null;
}

export function publicFromRow(row: UserRow): PublicUser {
  return toPublic(row);
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
    `SELECT username, country, elo, (w2 + l2 + d2) AS games,
            (pro_until IS NOT NULL AND pro_until > now()) AS pro
     FROM users WHERE (w2 + l2 + d2) > 0
     ORDER BY elo DESC LIMIT 50`,
  );
  const winsRes = await pool.query(
    `SELECT username, country, (won3 + won4) AS wins, (played3 + played4) AS games,
            (pro_until IS NOT NULL AND pro_until > now()) AS pro
     FROM users WHERE (played3 + played4) > 0
     ORDER BY wins DESC, games ASC LIMIT 50`,
  );
  return {
    elo: eloRes.rows as EloEntry[],
    wins: winsRes.rows as WinsEntry[],
  };
}

/**
 * Atomically consume one daily review for the user. Returns `allowed: true` on
 * success along with the new usage count. Pro users always succeed and are not
 * counted.
 */
export async function tryConsumeReview(
  userId: number,
): Promise<{ allowed: boolean; isPro: boolean; used: number; limit: number }> {
  if (!pool) return { allowed: false, isPro: false, used: 0, limit: FREE_REVIEWS_PER_DAY };
  // Single round-trip: bump the counter if Pro or under the limit, else no-op.
  const sql = `
    UPDATE users
       SET reviews_date  = CURRENT_DATE,
           reviews_today = CASE
             WHEN pro_until IS NOT NULL AND pro_until > now() THEN reviews_today
             WHEN reviews_date = CURRENT_DATE THEN reviews_today + 1
             ELSE 1
           END
     WHERE id = $1
       AND (
         (pro_until IS NOT NULL AND pro_until > now())
         OR reviews_date IS NULL
         OR reviews_date <> CURRENT_DATE
         OR reviews_today < $2
       )
     RETURNING reviews_today,
               (pro_until IS NOT NULL AND pro_until > now()) AS is_pro;
  `;
  const res = await pool.query(sql, [userId, FREE_REVIEWS_PER_DAY]);
  if (res.rowCount && res.rowCount > 0) {
    const { reviews_today, is_pro } = res.rows[0];
    return {
      allowed: true,
      isPro: !!is_pro,
      used: is_pro ? 0 : reviews_today,
      limit: FREE_REVIEWS_PER_DAY,
    };
  }
  return { allowed: false, isPro: false, used: FREE_REVIEWS_PER_DAY, limit: FREE_REVIEWS_PER_DAY };
}

/** Give a daily review back to a free user (e.g. when OpenAI failed). */
export async function refundReview(userId: number): Promise<void> {
  if (!pool) return;
  await pool.query(
    `UPDATE users
        SET reviews_today = GREATEST(reviews_today - 1, 0)
      WHERE id = $1
        AND reviews_date = CURRENT_DATE
        AND NOT (pro_until IS NOT NULL AND pro_until > now())`,
    [userId],
  );
}

export async function setStripeCustomerId(userId: number, customerId: string): Promise<void> {
  if (!pool) return;
  await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
}

export async function setProUntil(userId: number, until: Date | null): Promise<void> {
  if (!pool) return;
  await pool.query('UPDATE users SET pro_until = $1 WHERE id = $2', [until, userId]);
}

export async function findByStripeCustomerId(customerId: string): Promise<PublicUser | null> {
  if (!pool) return null;
  const res = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE stripe_customer_id = $1`,
    [customerId],
  );
  return res.rows[0] ? toPublic(res.rows[0]) : null;
}

export async function getStripeCustomerId(userId: number): Promise<string | null> {
  if (!pool) return null;
  const res = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
  return res.rows[0]?.stripe_customer_id ?? null;
}

export async function setBoardTheme(userId: number, theme: BoardTheme | null): Promise<PublicUser | null> {
  if (!pool) return null;
  if (theme !== null && !BOARD_THEMES.includes(theme)) return null;
  const res = await pool.query(
    `UPDATE users SET board_theme = $1 WHERE id = $2 RETURNING ${PUBLIC_COLUMNS}`,
    [theme, userId],
  );
  return res.rows[0] ? toPublic(res.rows[0]) : null;
}
