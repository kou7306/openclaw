import type { DatabaseSync } from "node:sqlite";
import { getContextBlocks } from "../memory/context-blocks.js";

export type ObservationInput = {
  workingText: string;
  recentAccess: Array<{
    short_id: string | null;
    fact_id: string | null;
    via: string;
    accessed_at: number;
  }>;
  recentShortMemories: Array<{ short_id: string; summary: string; created_at: number }>;
  trendingThemes: Array<{ name: string; usage_count: number }>;
};

export async function observe(db: DatabaseSync, home: string): Promise<ObservationInput> {
  const blocks = await getContextBlocks(home);
  const since = Date.now() - 24 * 3600 * 1000;

  const recentAccess = db
    .prepare(
      `SELECT short_id, fact_id, via, accessed_at
       FROM ai_memory_access_log
       WHERE accessed_at >= ?
       ORDER BY accessed_at DESC
       LIMIT 50`,
    )
    .all(since) as ObservationInput["recentAccess"];

  const recentShortMemories = db
    .prepare(
      `SELECT short_id, summary, created_at
       FROM ai_short_memories
       WHERE created_at >= ?
       ORDER BY created_at DESC
       LIMIT 10`,
    )
    .all(since) as ObservationInput["recentShortMemories"];

  const trendingThemes = db
    .prepare(
      `SELECT name, usage_count
       FROM ai_themes
       ORDER BY last_used_at DESC NULLS LAST, usage_count DESC
       LIMIT 8`,
    )
    .all() as ObservationInput["trendingThemes"];

  return {
    workingText: blocks.working,
    recentAccess,
    recentShortMemories,
    trendingThemes,
  };
}
