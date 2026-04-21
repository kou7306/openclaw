import type { DatabaseSync } from "node:sqlite";
import type { ObservationInput } from "./observe.js";

const SAME_THEME_COOLDOWN_MS = 3 * 3600 * 1000;
const GLOBAL_MIN_INTERVAL_MS = 30 * 60 * 1000;

export type ThrottleGate = {
  allowed: boolean;
  reason?: string;
};

export function shouldUtter(db: DatabaseSync, obs: ObservationInput): ThrottleGate {
  ensureThrottleTable(db);
  const now = Date.now();

  const lastGlobal = db
    .prepare(`SELECT MAX(uttered_at) AS at FROM ai_heartbeat_utterances`)
    .get() as { at: number | null };
  if (lastGlobal.at && now - lastGlobal.at < GLOBAL_MIN_INTERVAL_MS) {
    return { allowed: false, reason: "global-cooldown" };
  }

  const activeThemes = obs.trendingThemes.map((t) => t.name);
  if (activeThemes.length > 0) {
    const placeholders = activeThemes.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT theme, MAX(uttered_at) AS at
         FROM ai_heartbeat_utterances
         WHERE theme IN (${placeholders})
         GROUP BY theme`,
      )
      .all(...activeThemes) as Array<{ theme: string; at: number }>;
    for (const row of rows) {
      if (now - row.at < SAME_THEME_COOLDOWN_MS) {
        return { allowed: false, reason: `theme-cooldown:${row.theme}` };
      }
    }
  }

  return { allowed: true };
}

export function recordUtterance(db: DatabaseSync, themes: string[]): void {
  ensureThrottleTable(db);
  const now = Date.now();
  const stmt = db.prepare(`INSERT INTO ai_heartbeat_utterances(theme, uttered_at) VALUES(?, ?)`);
  if (themes.length === 0) {
    stmt.run(null, now);
    return;
  }
  for (const t of themes) {
    stmt.run(t, now);
  }
}

function ensureThrottleTable(db: DatabaseSync): void {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS ai_heartbeat_utterances (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       theme      TEXT,
       uttered_at INTEGER NOT NULL
     )`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_ai_heartbeat_theme_at ON ai_heartbeat_utterances(theme, uttered_at)`,
  ).run();
}
