import type { DatabaseSync } from "node:sqlite";
import type { EmbedFn } from "../memory/recall.js";
import {
  listExistingDomainNames,
  listExistingThemeNamesForDomains,
  upsertShortMemoryAndElements,
} from "../memory/semantic-elements.js";
import type { ShortMemoryInput } from "../memory/types.js";

export type DreamingPhase = "light" | "deep" | "rem";

export type AiCloneDreamingDeps = {
  db: DatabaseSync;
  embed: EmbedFn;
  compress: CompressFn;
};

export type CompressInput = {
  chunkId: string;
  path: string;
  text: string;
  existingDomains: string[];
  existingThemesByDomain: Array<{ domain: string; theme: string }>;
};

export type CompressFn = (
  input: CompressInput,
) => Promise<Omit<ShortMemoryInput, "chunk_id" | "path">>;

export async function runAiCloneDreaming(
  deps: AiCloneDreamingDeps,
  phase: DreamingPhase,
): Promise<{ processed: number }> {
  const candidates = selectUnprocessedChunks(deps.db, phase);
  const existingDomains = listExistingDomainNames(deps.db);
  const existingThemesByDomain = listExistingThemeNamesForDomains(deps.db, existingDomains);

  let processed = 0;
  for (const candidate of candidates) {
    const compressed = await deps.compress({
      chunkId: candidate.chunk_id,
      path: candidate.path,
      text: candidate.text,
      existingDomains,
      existingThemesByDomain,
    });
    await upsertShortMemoryAndElements(deps.db, deps.embed, {
      chunk_id: candidate.chunk_id,
      path: candidate.path,
      summary: compressed.summary,
      elements: compressed.elements,
      domain: compressed.domain,
      themes: compressed.themes,
    });
    processed += 1;
  }

  return { processed };
}

function selectUnprocessedChunks(
  db: DatabaseSync,
  phase: DreamingPhase,
): Array<{ chunk_id: string; path: string; text: string }> {
  const lookbackDays = phase === "light" ? 2 : phase === "deep" ? 30 : 90;
  const limit = phase === "light" ? 100 : phase === "deep" ? 50 : 20;
  const since = Math.floor(Date.now() / 1000) - lookbackDays * 24 * 3600;
  return db
    .prepare(
      `SELECT c.id AS chunk_id, c.path, c.text
       FROM chunks c
       LEFT JOIN ai_short_memories s ON s.chunk_id = c.id
       WHERE s.chunk_id IS NULL
         AND c.updated_at >= ?
       ORDER BY c.updated_at DESC
       LIMIT ?`,
    )
    .all(since, limit) as Array<{ chunk_id: string; path: string; text: string }>;
}
