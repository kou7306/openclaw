export type FactType = "episodic" | "fact" | "preference" | "profile";

export type TimeHint = "recent" | "anytime";

export type RecallParams = {
  query: string;
  themes?: string[];
  memory_type?: FactType;
  time_hint?: TimeHint;
  limit?: number;
};

export type RecallHit = {
  short_id: string;
  chunk_id: string;
  short_memory: string;
  facts: string[];
  themes: string[];
  created_at: number;
  score: number;
};

export type RecallResult = {
  results: RecallHit[];
  meta: {
    total: number;
    fts_hits: number;
    vec_hits: number;
  };
};

export type ShortMemoryInput = {
  chunk_id: string;
  path: string;
  summary: string;
  facts: Array<{ fact_text: string; fact_type?: FactType }>;
  themes: string[];
};
