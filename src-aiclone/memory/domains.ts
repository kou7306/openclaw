import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type SeedDomain = {
  name: string;
  description: string;
};

export const SEED_DOMAINS: SeedDomain[] = [
  { name: "ai-partner", description: "AI パートナー本体に関する記憶（記憶設計、検索、HeartBeat、対話）" },
  { name: "career", description: "キャリア・進路・所属・案件" },
  { name: "research", description: "研究・学習・つくばチャレンジ・ロボット" },
  { name: "health", description: "健康・睡眠・食事・運動" },
  { name: "money", description: "お金・支出・契約・税金" },
  { name: "daily-life", description: "日常生活・家族・趣味・人間関係" },
];

export function ensureSeedDomains(db: DatabaseSync): void {
  const now = Date.now();
  for (const seed of SEED_DOMAINS) {
    const existing = db
      .prepare(`SELECT domain_id FROM ai_domains WHERE name = ?`)
      .get(seed.name) as { domain_id: string } | undefined;
    if (existing) {
      db.prepare(`UPDATE ai_domains SET description = COALESCE(description, ?) WHERE domain_id = ?`).run(
        seed.description,
        existing.domain_id,
      );
      continue;
    }
    db.prepare(
      `INSERT INTO ai_domains(domain_id, name, description, usage_count, last_used_at)
       VALUES(?, ?, ?, 0, ?)`,
    ).run(randomUUID(), seed.name, seed.description, now);
  }
}

export function listDomainsForIndex(
  db: DatabaseSync,
  limit = 12,
): Array<{ name: string; description: string | null; usage_count: number }> {
  return db
    .prepare(
      `SELECT name, description, usage_count
       FROM ai_domains
       ORDER BY usage_count DESC, last_used_at DESC NULLS LAST
       LIMIT ?`,
    )
    .all(limit) as Array<{ name: string; description: string | null; usage_count: number }>;
}
