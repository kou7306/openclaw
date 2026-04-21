import type { DatabaseSync } from "node:sqlite";

export type AccessVia = "recall" | "get_recent" | "get_related";

export function logAccess(
  db: DatabaseSync,
  entry: {
    fact_id?: string;
    short_id?: string;
    session_id?: string;
    via: AccessVia;
  },
): void {
  db.prepare(
    `INSERT INTO ai_memory_access_log(fact_id, short_id, session_id, via, accessed_at)
     VALUES(?, ?, ?, ?, ?)`,
  ).run(
    entry.fact_id ?? null,
    entry.short_id ?? null,
    entry.session_id ?? null,
    entry.via,
    Date.now(),
  );
}

export function getRecentShortMemories(
  db: DatabaseSync,
  params: { days: number; limit?: number },
): Array<{
  short_id: string;
  chunk_id: string;
  summary: string;
  created_at: number;
}> {
  const since = Date.now() - params.days * 24 * 3600 * 1000;
  return db
    .prepare(
      `SELECT short_id, chunk_id, summary, created_at
       FROM ai_short_memories
       WHERE created_at >= ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(since, params.limit ?? 20) as Array<{
    short_id: string;
    chunk_id: string;
    summary: string;
    created_at: number;
  }>;
}

export function getRelatedShortMemories(
  db: DatabaseSync,
  params: { short_id: string; limit?: number },
): Array<{ short_id: string; link_type: string; weight: number }> {
  return db
    .prepare(
      `SELECT to_short_id AS short_id, link_type, weight
       FROM ai_memory_links
       WHERE from_short_id = ?
       ORDER BY weight DESC
       LIMIT ?`,
    )
    .all(params.short_id, params.limit ?? 10) as Array<{
    short_id: string;
    link_type: string;
    weight: number;
  }>;
}
