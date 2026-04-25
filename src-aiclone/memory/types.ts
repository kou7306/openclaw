export type ElementType = "fact" | "question" | "decision" | "emotion" | "task" | "preference";

export type RecallMode = "fast" | "deep" | "auto";

export type TimeHint = "recent" | "anytime";

export type RecallParams = {
  query: string;
  mode?: RecallMode;
  domains?: string[];
  themes?: string[];
  element_types?: ElementType[];
  time_hint?: TimeHint;
  limit?: number;
};

export type RecallElement = {
  type: ElementType;
  text: string;
};

export type RecallHit = {
  short_id: string;
  chunk_id: string;
  short_memory: string;
  elements: RecallElement[];
  domain: string | null;
  themes: string[];
  created_at: number;
  score: number;
};

export type RecallResult = {
  results: RecallHit[];
  meta: {
    mode_executed: "fast" | "deep";
    total: number;
    fts_hits: number;
    vec_hits: number;
    selected_domains: string[];
    selected_themes: string[];
  };
};

export type ShortMemoryInput = {
  chunk_id: string;
  path: string;
  summary: string;
  elements: Array<{ element_type: ElementType; text: string; importance?: number }>;
  domain?: string;
  themes: string[];
};
