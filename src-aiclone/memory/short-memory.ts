import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { EmbedFn } from "./recall.js";
import type { ShortMemoryInput } from "./types.js";

export async function upsertShortMemoryAndFacts(
  db: DatabaseSync,
  embed: EmbedFn,
  input: ShortMemoryInput,
): Promise<{ short_id: string; fact_ids: string[] }> {
  const now = Date.now();

  const existingShort = db
    .prepare(`SELECT short_id FROM ai_short_memories WHERE chunk_id = ?`)
    .get(input.chunk_id) as { short_id: string } | undefined;

  const shortId = existingShort?.short_id ?? randomUUID();

  if (existingShort) {
    db.prepare(`UPDATE ai_short_memories SET summary = ?, path = ? WHERE short_id = ?`).run(
      input.summary,
      input.path,
      shortId,
    );
    db.prepare(`DELETE FROM ai_facts WHERE short_id = ?`).run(shortId);
    db.prepare(
      `DELETE FROM ai_fact_vec WHERE fact_id IN (SELECT fact_id FROM ai_facts WHERE short_id = ?)`,
    ).run(shortId);
    db.prepare(`DELETE FROM ai_summary_vec WHERE short_id = ?`).run(shortId);
  } else {
    db.prepare(
      `INSERT INTO ai_short_memories(short_id, chunk_id, path, summary, created_at)
       VALUES(?, ?, ?, ?, ?)`,
    ).run(shortId, input.chunk_id, input.path, input.summary, now);
  }

  const summaryVec = await embed(input.summary);
  db.prepare(`INSERT INTO ai_summary_vec(short_id, embedding) VALUES(?, ?)`).run(
    shortId,
    toVecBlob(summaryVec),
  );

  const factIds: string[] = [];
  for (const fact of input.facts) {
    const factId = randomUUID();
    db.prepare(
      `INSERT INTO ai_facts(fact_id, short_id, chunk_id, fact_text, fact_type, created_at)
       VALUES(?, ?, ?, ?, ?, ?)`,
    ).run(factId, shortId, input.chunk_id, fact.fact_text, fact.fact_type ?? null, now);

    const contextualized = `${input.summary}\n\n${fact.fact_text}`;
    const factVec = await embed(contextualized);
    db.prepare(`INSERT INTO ai_fact_vec(fact_id, embedding) VALUES(?, ?)`).run(
      factId,
      toVecBlob(factVec),
    );
    factIds.push(factId);
  }

  attachThemes(db, input.chunk_id, input.themes, now);

  return { short_id: shortId, fact_ids: factIds };
}

function attachThemes(db: DatabaseSync, chunkId: string, themes: string[], now: number): void {
  db.prepare(`DELETE FROM ai_memory_themes WHERE chunk_id = ?`).run(chunkId);
  for (const name of themes) {
    const normalized = name.trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    const existing = db.prepare(`SELECT theme_id FROM ai_themes WHERE name = ?`).get(normalized) as
      | { theme_id: string }
      | undefined;
    const themeId = existing?.theme_id ?? randomUUID();
    if (!existing) {
      db.prepare(
        `INSERT INTO ai_themes(theme_id, name, usage_count, last_used_at) VALUES(?, ?, 1, ?)`,
      ).run(themeId, normalized, now);
    } else {
      db.prepare(
        `UPDATE ai_themes SET usage_count = usage_count + 1, last_used_at = ? WHERE theme_id = ?`,
      ).run(now, themeId);
    }
    db.prepare(`INSERT OR IGNORE INTO ai_memory_themes(chunk_id, theme_id) VALUES(?, ?)`).run(
      chunkId,
      themeId,
    );
  }
}

function toVecBlob(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function listExistingThemeNames(db: DatabaseSync, limit = 200): string[] {
  const rows = db
    .prepare(`SELECT name FROM ai_themes ORDER BY usage_count DESC, last_used_at DESC LIMIT ?`)
    .all(limit) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}
