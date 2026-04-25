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

  `CREATE TABLE IF NOT EXISTS ai_semantic_elements (
     element_id   TEXT PRIMARY KEY,
     short_id     TEXT NOT NULL,
     chunk_id     TEXT NOT NULL,
     element_type TEXT NOT NULL,
     text         TEXT NOT NULL,
     importance   REAL NOT NULL DEFAULT 0.5,
     created_at   INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_elem_short ON ai_semantic_elements(short_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_elem_type  ON ai_semantic_elements(element_type)`,

  `CREATE TABLE IF NOT EXISTS ai_domains (
     domain_id    TEXT PRIMARY KEY,
     name         TEXT UNIQUE NOT NULL,
     description  TEXT,
     usage_count  INTEGER NOT NULL DEFAULT 0,
     last_used_at INTEGER
   )`,

  `CREATE TABLE IF NOT EXISTS ai_themes (
     theme_id     TEXT PRIMARY KEY,
     domain_id    TEXT NOT NULL,
     name         TEXT NOT NULL,
     usage_count  INTEGER NOT NULL DEFAULT 0,
     last_used_at INTEGER,
     UNIQUE(domain_id, name)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_themes_domain ON ai_themes(domain_id)`,

  `CREATE TABLE IF NOT EXISTS ai_memory_themes (
     chunk_id  TEXT NOT NULL,
     theme_id  TEXT NOT NULL,
     PRIMARY KEY (chunk_id, theme_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_memory_themes_theme ON ai_memory_themes(theme_id)`,

  `CREATE TABLE IF NOT EXISTS ai_entities (
     entity_id    TEXT PRIMARY KEY,
     name         TEXT UNIQUE NOT NULL,
     kind         TEXT,
     usage_count  INTEGER NOT NULL DEFAULT 0,
     last_used_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS ai_memory_entities (
     chunk_id  TEXT NOT NULL,
     entity_id TEXT NOT NULL,
     PRIMARY KEY (chunk_id, entity_id)
   )`,

  `CREATE TABLE IF NOT EXISTS ai_memory_access_log (
     access_id   INTEGER PRIMARY KEY AUTOINCREMENT,
     element_id  TEXT,
     short_id    TEXT,
     session_id  TEXT,
     via         TEXT,
     mode        TEXT,
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

  `CREATE VIRTUAL TABLE IF NOT EXISTS ai_elements_fts USING fts5(
     element_id UNINDEXED,
     text,
     content='ai_semantic_elements',
     content_rowid='rowid'
   )`,
  `CREATE TRIGGER IF NOT EXISTS ai_elements_ai AFTER INSERT ON ai_semantic_elements BEGIN
     INSERT INTO ai_elements_fts(rowid, element_id, text) VALUES (new.rowid, new.element_id, new.text);
   END`,
  `CREATE TRIGGER IF NOT EXISTS ai_elements_ad AFTER DELETE ON ai_semantic_elements BEGIN
     INSERT INTO ai_elements_fts(ai_elements_fts, rowid, element_id, text) VALUES('delete', old.rowid, old.element_id, old.text);
   END`,
  `CREATE TRIGGER IF NOT EXISTS ai_elements_au AFTER UPDATE ON ai_semantic_elements BEGIN
     INSERT INTO ai_elements_fts(ai_elements_fts, rowid, element_id, text) VALUES('delete', old.rowid, old.element_id, old.text);
     INSERT INTO ai_elements_fts(rowid, element_id, text) VALUES (new.rowid, new.element_id, new.text);
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
    `CREATE VIRTUAL TABLE IF NOT EXISTS ai_element_vec USING vec0(
       element_id TEXT PRIMARY KEY,
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
