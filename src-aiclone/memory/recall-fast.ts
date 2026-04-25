import type { DatabaseSync } from "node:sqlite";
import type { ElementType, RecallHit, RecallParams, RecallResult } from "./types.js";

const DEFAULT_LIMIT = 8;
const FTS_CANDIDATES = 50;
const VEC_CANDIDATES = 50;
const RRF_K = 60;

export type EmbedFn = (text: string) => Promise<Float32Array>;

export type DomainThemeSelector = (params: {
  query: string;
  domains: Array<{ name: string; usage_count: number }>;
  themesByDomain: Map<string, string[]>;
}) => Promise<{ selectedDomains: string[]; selectedThemes: string[] }>;

export type RecallFastDeps = {
  db: DatabaseSync;
  embed: EmbedFn;
  selectDomainsAndThemes: DomainThemeSelector;
};

export async function recallFast(
  deps: RecallFastDeps,
  params: RecallParams,
): Promise<RecallResult> {
  const limit = params.limit ?? DEFAULT_LIMIT;

  const { selectedDomains, selectedThemes } = await pickDomainsAndThemes(deps, params);
  const themeIds = resolveThemeIds(deps.db, selectedDomains, selectedThemes);

  const ftsHits = searchElementsFts(
    deps.db,
    params.query,
    themeIds,
    params.element_types,
    FTS_CANDIDATES,
  );
  const queryVec = await deps.embed(params.query);
  const vecHits = searchElementsVec(
    deps.db,
    queryVec,
    themeIds,
    params.element_types,
    VEC_CANDIDATES,
  );

  const fusedElementIds = rrfFusion(ftsHits, vecHits);
  const grouped = groupByShortMemory(deps.db, fusedElementIds);
  const scored = applyActivation(grouped, params);

  return {
    results: scored.slice(0, limit),
    meta: {
      mode_executed: "fast",
      total: scored.length,
      fts_hits: ftsHits.length,
      vec_hits: vecHits.length,
      selected_domains: selectedDomains,
      selected_themes: selectedThemes,
    },
  };
}

async function pickDomainsAndThemes(
  deps: RecallFastDeps,
  params: RecallParams,
): Promise<{ selectedDomains: string[]; selectedThemes: string[] }> {
  if (params.domains && params.domains.length > 0) {
    return {
      selectedDomains: params.domains.map((d) => d.toLowerCase()),
      selectedThemes: (params.themes ?? []).map((t) => t.toLowerCase()),
    };
  }

  const domains = deps.db
    .prepare(
      `SELECT name, usage_count FROM ai_domains
       ORDER BY usage_count DESC, last_used_at DESC NULLS LAST LIMIT 12`,
    )
    .all() as Array<{ name: string; usage_count: number }>;

  if (domains.length === 0) {
    return { selectedDomains: [], selectedThemes: params.themes ?? [] };
  }

  const themesByDomain = new Map<string, string[]>();
  for (const d of domains) {
    const themes = deps.db
      .prepare(
        `SELECT t.name FROM ai_themes t
         JOIN ai_domains d ON d.domain_id = t.domain_id
         WHERE d.name = ?
         ORDER BY t.usage_count DESC, t.last_used_at DESC NULLS LAST
         LIMIT 8`,
      )
      .all(d.name) as Array<{ name: string }>;
    themesByDomain.set(
      d.name,
      themes.map((t) => t.name),
    );
  }

  return deps.selectDomainsAndThemes({
    query: params.query,
    domains,
    themesByDomain,
  });
}

function resolveThemeIds(
  db: DatabaseSync,
  domainNames: string[],
  themeNames: string[],
): string[] {
  if (domainNames.length === 0 && themeNames.length === 0) return [];
  if (themeNames.length === 0 && domainNames.length > 0) {
    const placeholders = domainNames.map(() => "?").join(",");
    return (
      db
        .prepare(
          `SELECT t.theme_id FROM ai_themes t
           JOIN ai_domains d ON d.domain_id = t.domain_id
           WHERE d.name IN (${placeholders})`,
        )
        .all(...domainNames) as Array<{ theme_id: string }>
    ).map((r) => r.theme_id);
  }
  if (themeNames.length > 0) {
    const placeholders = themeNames.map(() => "?").join(",");
    return (
      db
        .prepare(`SELECT theme_id FROM ai_themes WHERE name IN (${placeholders})`)
        .all(...themeNames) as Array<{ theme_id: string }>
    ).map((r) => r.theme_id);
  }
  return [];
}

function searchElementsFts(
  db: DatabaseSync,
  query: string,
  themeIds: string[],
  elementTypes: ElementType[] | undefined,
  limit: number,
): string[] {
  const themeFilter = buildThemeFilter(themeIds);
  const typeFilter = buildTypeFilter(elementTypes);
  const sql = `
    SELECT e.element_id
    FROM ai_elements_fts fts
    JOIN ai_semantic_elements e ON e.element_id = fts.element_id
    ${themeFilter.join}
    WHERE fts.text MATCH ?
      ${themeFilter.where}
      ${typeFilter.where}
    ORDER BY fts.rank
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(...themeFilter.params, query, ...typeFilter.params, limit) as Array<{
    element_id: string;
  }>;
  return rows.map((r) => r.element_id);
}

function searchElementsVec(
  db: DatabaseSync,
  vec: Float32Array,
  themeIds: string[],
  elementTypes: ElementType[] | undefined,
  limit: number,
): string[] {
  const themeFilter = buildThemeFilter(themeIds);
  const typeFilter = buildTypeFilter(elementTypes);
  const sql = `
    SELECT e.element_id
    FROM ai_element_vec v
    JOIN ai_semantic_elements e ON e.element_id = v.element_id
    ${themeFilter.join}
    WHERE v.embedding MATCH ?
      ${themeFilter.where}
      ${typeFilter.where}
    ORDER BY v.distance
    LIMIT ?
  `;
  const rows = db
    .prepare(sql)
    .all(...themeFilter.params, vecBlob(vec), ...typeFilter.params, limit) as Array<{ element_id: string }>;
  return rows.map((r) => r.element_id);
}

function buildThemeFilter(themeIds: string[]): {
  join: string;
  where: string;
  params: string[];
} {
  if (themeIds.length === 0) {
    return { join: "", where: "", params: [] };
  }
  const placeholders = themeIds.map(() => "?").join(",");
  return {
    join: `JOIN ai_memory_themes mt ON mt.chunk_id = e.chunk_id`,
    where: `AND mt.theme_id IN (${placeholders})`,
    params: themeIds,
  };
}

function buildTypeFilter(types: ElementType[] | undefined): {
  where: string;
  params: ElementType[];
} {
  if (!types || types.length === 0) return { where: "", params: [] };
  const placeholders = types.map(() => "?").join(",");
  return {
    where: `AND e.element_type IN (${placeholders})`,
    params: types,
  };
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
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

type GroupedShort = {
  short_id: string;
  chunk_id: string;
  summary: string;
  path: string;
  created_at: number;
  importance: number;
  domain: string | null;
  themes: string[];
  hit_elements: Array<{ type: ElementType; text: string }>;
  element_count: number;
};

function groupByShortMemory(db: DatabaseSync, elementIds: string[]): GroupedShort[] {
  if (elementIds.length === 0) return [];
  const placeholders = elementIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT e.element_id, e.element_type, e.text,
              s.short_id, s.chunk_id, s.path, s.summary, s.importance, s.created_at
       FROM ai_semantic_elements e
       JOIN ai_short_memories s ON s.short_id = e.short_id
       WHERE e.element_id IN (${placeholders})`,
    )
    .all(...elementIds) as Array<{
    element_id: string;
    element_type: ElementType;
    text: string;
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
      existing.hit_elements.push({ type: row.element_type, text: row.text });
      existing.element_count += 1;
    } else {
      const classification = loadClassification(db, row.chunk_id);
      grouped.set(row.short_id, {
        short_id: row.short_id,
        chunk_id: row.chunk_id,
        summary: row.summary,
        path: row.path,
        importance: row.importance,
        created_at: row.created_at,
        domain: classification.domain,
        themes: classification.themes,
        hit_elements: [{ type: row.element_type, text: row.text }],
        element_count: 1,
      });
    }
  }
  return [...grouped.values()];
}

function loadClassification(
  db: DatabaseSync,
  chunkId: string,
): { domain: string | null; themes: string[] } {
  const rows = db
    .prepare(
      `SELECT d.name AS domain, t.name AS theme
       FROM ai_memory_themes mt
       JOIN ai_themes t ON t.theme_id = mt.theme_id
       JOIN ai_domains d ON d.domain_id = t.domain_id
       WHERE mt.chunk_id = ?`,
    )
    .all(chunkId) as Array<{ domain: string; theme: string }>;
  const themes = [...new Set(rows.map((r) => r.theme))];
  const domain = rows[0]?.domain ?? null;
  return { domain, themes };
}

function applyActivation(grouped: GroupedShort[], params: RecallParams): RecallHit[] {
  const now = Date.now();
  const recencyHalfLifeMs =
    params.time_hint === "anytime" ? 365 * 24 * 3600 * 1000 : 14 * 24 * 3600 * 1000;

  return grouped
    .map((g) => {
      const ageMs = Math.max(1, now - g.created_at);
      const recency = Math.pow(0.5, ageMs / recencyHalfLifeMs);
      const elementDensity = Math.min(1, g.element_count / 3);
      const score = g.importance * 0.3 + recency * 0.3 + elementDensity * 0.4;
      return {
        short_id: g.short_id,
        chunk_id: g.chunk_id,
        short_memory: g.summary,
        elements: g.hit_elements.map((e) => ({ type: e.type, text: e.text })),
        domain: g.domain,
        themes: g.themes,
        created_at: g.created_at,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}
