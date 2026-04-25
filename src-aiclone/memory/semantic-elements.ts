import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { EmbedFn } from "./recall-fast.js";
import type { ShortMemoryInput } from "./types.js";

export async function upsertShortMemoryAndElements(
  db: DatabaseSync,
  embed: EmbedFn,
  input: ShortMemoryInput,
): Promise<{ short_id: string; element_ids: string[] }> {
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
    db.prepare(
      `DELETE FROM ai_element_vec WHERE element_id IN (SELECT element_id FROM ai_semantic_elements WHERE short_id = ?)`,
    ).run(shortId);
    db.prepare(`DELETE FROM ai_semantic_elements WHERE short_id = ?`).run(shortId);
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

  const elementIds: string[] = [];
  for (const el of input.elements) {
    const elementId = randomUUID();
    db.prepare(
      `INSERT INTO ai_semantic_elements(element_id, short_id, chunk_id, element_type, text, importance, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      elementId,
      shortId,
      input.chunk_id,
      el.element_type,
      el.text,
      el.importance ?? 0.5,
      now,
    );

    const contextualized = `${input.summary}\n\n[${el.element_type}] ${el.text}`;
    const elemVec = await embed(contextualized);
    db.prepare(`INSERT INTO ai_element_vec(element_id, embedding) VALUES(?, ?)`).run(
      elementId,
      toVecBlob(elemVec),
    );
    elementIds.push(elementId);
  }

  attachClassification(db, input.chunk_id, input.domain, input.themes, now);

  return { short_id: shortId, element_ids: elementIds };
}

function attachClassification(
  db: DatabaseSync,
  chunkId: string,
  domainName: string | undefined,
  themeNames: string[],
  now: number,
): void {
  db.prepare(`DELETE FROM ai_memory_themes WHERE chunk_id = ?`).run(chunkId);
  if (themeNames.length === 0) return;

  const domainId = domainName ? upsertDomain(db, domainName, now) : null;
  if (!domainId) return;

  for (const rawName of themeNames) {
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    const themeId = upsertTheme(db, domainId, name, now);
    db.prepare(`INSERT OR IGNORE INTO ai_memory_themes(chunk_id, theme_id) VALUES(?, ?)`).run(
      chunkId,
      themeId,
    );
  }
}

function upsertDomain(db: DatabaseSync, rawName: string, now: number): string {
  const name = rawName.trim().toLowerCase();
  const existing = db.prepare(`SELECT domain_id FROM ai_domains WHERE name = ?`).get(name) as
    | { domain_id: string }
    | undefined;
  if (existing) {
    db.prepare(
      `UPDATE ai_domains SET usage_count = usage_count + 1, last_used_at = ? WHERE domain_id = ?`,
    ).run(now, existing.domain_id);
    return existing.domain_id;
  }
  const domainId = randomUUID();
  db.prepare(
    `INSERT INTO ai_domains(domain_id, name, usage_count, last_used_at) VALUES(?, ?, 1, ?)`,
  ).run(domainId, name, now);
  return domainId;
}

function upsertTheme(db: DatabaseSync, domainId: string, name: string, now: number): string {
  const existing = db
    .prepare(`SELECT theme_id FROM ai_themes WHERE domain_id = ? AND name = ?`)
    .get(domainId, name) as { theme_id: string } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE ai_themes SET usage_count = usage_count + 1, last_used_at = ? WHERE theme_id = ?`,
    ).run(now, existing.theme_id);
    return existing.theme_id;
  }
  const themeId = randomUUID();
  db.prepare(
    `INSERT INTO ai_themes(theme_id, domain_id, name, usage_count, last_used_at) VALUES(?, ?, ?, 1, ?)`,
  ).run(themeId, domainId, name, now);
  return themeId;
}

function toVecBlob(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function listExistingDomainNames(db: DatabaseSync, limit = 50): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM ai_domains ORDER BY usage_count DESC, last_used_at DESC NULLS LAST LIMIT ?`,
    )
    .all(limit) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

export function listExistingThemeNamesForDomains(
  db: DatabaseSync,
  domainNames: string[],
  limit = 50,
): Array<{ domain: string; theme: string }> {
  if (domainNames.length === 0) return [];
  const placeholders = domainNames.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT d.name AS domain, t.name AS theme
       FROM ai_themes t
       JOIN ai_domains d ON d.domain_id = t.domain_id
       WHERE d.name IN (${placeholders})
       ORDER BY t.usage_count DESC, t.last_used_at DESC NULLS LAST
       LIMIT ?`,
    )
    .all(...domainNames.map((n) => n.toLowerCase()), limit) as Array<{
    domain: string;
    theme: string;
  }>;
  return rows;
}
