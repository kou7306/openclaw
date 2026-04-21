import type { DatabaseSync } from "node:sqlite";
import type { RecallHit, RecallParams, RecallResult } from "./types.js";

const DEFAULT_LIMIT = 8;
const FTS_CANDIDATES = 50;
const VEC_CANDIDATES = 50;
const RRF_K = 60;

export type EmbedFn = (text: string) => Promise<Float32Array>;

export async function recall(
  db: DatabaseSync,
  embed: EmbedFn,
  params: RecallParams,
): Promise<RecallResult> {
  const limit = params.limit ?? DEFAULT_LIMIT;

  const ftsHits = searchFactsFts(db, params.query, FTS_CANDIDATES);
  const queryVec = await embed(params.query);
  const vecHits = searchFactsVec(db, queryVec, VEC_CANDIDATES);

  const fusedFactIds = rrfFusion(ftsHits, vecHits);
  const grouped = groupByShortMemory(db, fusedFactIds);
  const scored = applyActivation(grouped, params);

  return {
    results: scored.slice(0, limit),
    meta: {
      total: scored.length,
      fts_hits: ftsHits.length,
      vec_hits: vecHits.length,
    },
  };
}

function searchFactsFts(db: DatabaseSync, query: string, limit: number): string[] {
  const rows = db
    .prepare(
      `SELECT fact_id FROM ai_facts_fts
       WHERE ai_facts_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(query, limit) as Array<{ fact_id: string }>;
  return rows.map((r) => r.fact_id);
}

function searchFactsVec(db: DatabaseSync, vec: Float32Array, limit: number): string[] {
  const rows = db
    .prepare(
      `SELECT fact_id FROM ai_fact_vec
       WHERE embedding MATCH ?
       ORDER BY distance
       LIMIT ?`,
    )
    .all(vecBlob(vec), limit) as Array<{ fact_id: string }>;
  return rows.map((r) => r.fact_id);
}

function vecBlob(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

function rrfFusion(ftsIds: string[], vecIds: string[]): string[] {
  const scores = new Map<string, number>();
  ftsIds.forEach((id, i) => {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1));
  });
  vecIds.forEach((id, i) => {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1));
  });
  return [...scores.entries()].toSorted((a, b) => b[1] - a[1]).map(([id]) => id);
}

type GroupedShort = {
  short_id: string;
  chunk_id: string;
  summary: string;
  path: string;
  created_at: number;
  importance: number;
  themes: string[];
  hit_facts: string[];
  fact_count: number;
};

function groupByShortMemory(db: DatabaseSync, factIds: string[]): GroupedShort[] {
  if (factIds.length === 0) {
    return [];
  }

  const placeholders = factIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT f.fact_id, f.fact_text, s.short_id, s.chunk_id, s.path, s.summary, s.importance, s.created_at
       FROM ai_facts f
       JOIN ai_short_memories s ON s.short_id = f.short_id
       WHERE f.fact_id IN (${placeholders})`,
    )
    .all(...factIds) as Array<{
    fact_id: string;
    fact_text: string;
    short_id: string;
    chunk_id: string;
    path: string;
    summary: string;
    importance: number;
    created_at: number;
  }>;

  const grouped = new Map<string, GroupedShort>();
  for (const row of rows) {
    const existing = grouped.get(row.short_id);
    if (existing) {
      existing.hit_facts.push(row.fact_text);
      existing.fact_count += 1;
    } else {
      grouped.set(row.short_id, {
        short_id: row.short_id,
        chunk_id: row.chunk_id,
        summary: row.summary,
        path: row.path,
        importance: row.importance,
        created_at: row.created_at,
        themes: loadThemes(db, row.chunk_id),
        hit_facts: [row.fact_text],
        fact_count: 1,
      });
    }
  }
  return [...grouped.values()];
}

function loadThemes(db: DatabaseSync, chunkId: string): string[] {
  const rows = db
    .prepare(
      `SELECT t.name FROM ai_memory_themes mt
       JOIN ai_themes t ON t.theme_id = mt.theme_id
       WHERE mt.chunk_id = ?`,
    )
    .all(chunkId) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function applyActivation(grouped: GroupedShort[], params: RecallParams): RecallHit[] {
  const now = Date.now();
  const recencyHalfLifeMs =
    params.time_hint === "anytime" ? 365 * 24 * 3600 * 1000 : 14 * 24 * 3600 * 1000;

  return grouped
    .map((g) => {
      const ageMs = Math.max(1, now - g.created_at);
      const recency = Math.pow(0.5, ageMs / recencyHalfLifeMs);
      const themeBoost = themeMatchBoost(g.themes, params.themes);
      const factDensity = Math.min(1, g.fact_count / 3);
      const score = g.importance * 0.3 + recency * 0.3 + themeBoost * 0.2 + factDensity * 0.2;
      return {
        short_id: g.short_id,
        chunk_id: g.chunk_id,
        short_memory: g.summary,
        facts: g.hit_facts,
        themes: g.themes,
        created_at: g.created_at,
        score,
      };
    })
    .toSorted((a, b) => b.score - a.score);
}

function themeMatchBoost(themes: string[], hint?: string[]): number {
  if (!hint || hint.length === 0) {
    return 0.5;
  }
  const hinted = new Set(hint);
  const overlap = themes.filter((t) => hinted.has(t)).length;
  return overlap === 0 ? 0 : Math.min(1, overlap / hint.length);
}
