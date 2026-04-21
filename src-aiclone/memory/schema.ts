import type { DatabaseSync } from "node:sqlite";

export type EmbeddingMeta = {
  provider: string;
  dimension: number;
  runtime: string;
};

const DDL_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS ai_embedding_meta (
     key        TEXT PRIMARY KEY,
     provider   TEXT NOT NULL,
     dimension  INTEGER NOT NULL,
     runtime    TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS ai_short_memories (
     short_id   TEXT PRIMARY KEY,
     chunk_id   TEXT NOT NULL,
     path       TEXT NOT NULL,
     summary    TEXT NOT NULL,
     importance REAL NOT NULL DEFAULT 0.5,
     created_at INTEGER NOT NULL,
     UNIQUE(chunk_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_short_chunk   ON ai_short_memories(chunk_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_short_created ON ai_short_memories(created_at)`,

  `CREATE TABLE IF NOT EXISTS ai_facts (
     fact_id    TEXT PRIMARY KEY,
     short_id   TEXT NOT NULL,
     chunk_id   TEXT NOT NULL,
     fact_text  TEXT NOT NULL,
     fact_type  TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_facts_short ON ai_facts(short_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_facts_type  ON ai_facts(fact_type)`,

  `CREATE TABLE IF NOT EXISTS ai_themes (
     theme_id      TEXT PRIMARY KEY,
     name          TEXT UNIQUE NOT NULL,
     usage_count   INTEGER NOT NULL DEFAULT 0,
     last_used_at  INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS ai_memory_themes (
     chunk_id  TEXT NOT NULL,
     theme_id  TEXT NOT NULL,
     PRIMARY KEY (chunk_id, theme_id)
   )`,

  `CREATE TABLE IF NOT EXISTS ai_memory_access_log (
     access_id   INTEGER PRIMARY KEY AUTOINCREMENT,
     fact_id     TEXT,
     short_id    TEXT,
     session_id  TEXT,
     via         TEXT,
     accessed_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_access_session ON ai_memory_access_log(session_id)`,

  `CREATE TABLE IF NOT EXISTS ai_memory_links (
     from_short_id TEXT NOT NULL,
     to_short_id   TEXT NOT NULL,
     link_type     TEXT NOT NULL,
     weight        REAL NOT NULL DEFAULT 1.0,
     PRIMARY KEY (from_short_id, to_short_id, link_type)
   )`,

  `CREATE VIRTUAL TABLE IF NOT EXISTS ai_facts_fts USING fts5(
     fact_id UNINDEXED,
     fact_text,
     content='ai_facts',
     content_rowid='rowid'
   )`,
  `CREATE TRIGGER IF NOT EXISTS ai_facts_ai AFTER INSERT ON ai_facts BEGIN
     INSERT INTO ai_facts_fts(rowid, fact_id, fact_text) VALUES (new.rowid, new.fact_id, new.fact_text);
   END`,
  `CREATE TRIGGER IF NOT EXISTS ai_facts_ad AFTER DELETE ON ai_facts BEGIN
     INSERT INTO ai_facts_fts(ai_facts_fts, rowid, fact_id, fact_text) VALUES('delete', old.rowid, old.fact_id, old.fact_text);
   END`,
  `CREATE TRIGGER IF NOT EXISTS ai_facts_au AFTER UPDATE ON ai_facts BEGIN
     INSERT INTO ai_facts_fts(ai_facts_fts, rowid, fact_id, fact_text) VALUES('delete', old.rowid, old.fact_id, old.fact_text);
     INSERT INTO ai_facts_fts(rowid, fact_id, fact_text) VALUES (new.rowid, new.fact_id, new.fact_text);
   END`,
];

export function ensureAiCloneSchema(db: DatabaseSync, embedding: EmbeddingMeta): void {
  for (const stmt of DDL_STATEMENTS) {
    db.prepare(stmt).run();
  }
  ensureVecTables(db, embedding.dimension);
  upsertEmbeddingMeta(db, embedding);
}

function ensureVecTables(db: DatabaseSync, dim: number): void {
  db.prepare(
    `CREATE VIRTUAL TABLE IF NOT EXISTS ai_fact_vec USING vec0(
       fact_id TEXT PRIMARY KEY,
       embedding FLOAT[${dim}]
     )`,
  ).run();
  db.prepare(
    `CREATE VIRTUAL TABLE IF NOT EXISTS ai_summary_vec USING vec0(
       short_id TEXT PRIMARY KEY,
       embedding FLOAT[${dim}]
     )`,
  ).run();
}

function upsertEmbeddingMeta(db: DatabaseSync, meta: EmbeddingMeta): void {
  const existing = db
    .prepare(`SELECT provider, dimension FROM ai_embedding_meta WHERE key = 'current'`)
    .get() as { provider: string; dimension: number } | undefined;

  if (existing && (existing.provider !== meta.provider || existing.dimension !== meta.dimension)) {
    throw new Error(
      `embedding model mismatch: db=${existing.provider}/${existing.dimension}, config=${meta.provider}/${meta.dimension}. run scripts/reembed.ts to migrate.`,
    );
  }

  db.prepare(
    `INSERT INTO ai_embedding_meta(key, provider, dimension, runtime, updated_at)
     VALUES('current', ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET runtime = excluded.runtime, updated_at = excluded.updated_at`,
  ).run(meta.provider, meta.dimension, meta.runtime, Date.now());
}
