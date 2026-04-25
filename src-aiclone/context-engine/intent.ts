import type { RecallMode } from "../memory/types.js";

const DEFAULT_DEEP_KEYWORDS = [
  "原因",
  "傾向",
  "整理",
  "分析",
  "比較",
  "総合",
  "パターン",
  "自己分析",
  "振り返り",
  "過去",
  "長期",
];

export type IntentResolverConfig = {
  deepKeywords?: string[];
};

export function createIntentResolver(config: IntentResolverConfig = {}) {
  const keywords = config.deepKeywords ?? DEFAULT_DEEP_KEYWORDS;
  return function classifyMode(params: { query: string; mode?: RecallMode }): "fast" | "deep" {
    if (params.mode === "fast" || params.mode === "deep") return params.mode;
    if (containsAny(params.query, keywords)) return "deep";
    return "fast";
  };
}

function containsAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}
