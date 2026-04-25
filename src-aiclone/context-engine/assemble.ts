import type { ContextBlocks } from "../memory/context-blocks.js";

export type MemoryIndexSummary = {
  domains: Array<{ name: string; usage_count: number }>;
  recentThemes: string[];
};

export function buildSystemPromptAddition(
  blocks: ContextBlocks,
  index: MemoryIndexSummary,
): string {
  const persona = blocks.persona.trim() || "(persona.md is empty)";
  const working = blocks.working.trim() || "(working.md is empty)";
  const activeTopics = blocks.activeTopics.trim() || "(active_topics.md is empty)";

  const domainList =
    index.domains.length > 0
      ? index.domains.map((d) => `${d.name}(${d.usage_count})`).join(", ")
      : "(no domains yet)";
  const recentThemes = index.recentThemes.length > 0 ? index.recentThemes.join(", ") : "(none)";

  return [
    "You are kouta's personal AI partner.",
    "Treat the following persona / working memory / active topics as ground truth context for every turn.",
    "",
    "<persona>",
    persona,
    "</persona>",
    "",
    "<working>",
    working,
    "</working>",
    "",
    "<active_topics>",
    activeTopics,
    "</active_topics>",
    "",
    "<memory_index>",
    `domains: ${domainList}`,
    `recent_themes: ${recentThemes}`,
    "</memory_index>",
    "",
    "Use recall(mode=\"fast\") for ordinary recall, and recall(mode=\"deep\") only when the user asks for analysis,",
    "pattern detection, root cause, comparison, or self-reflection. Always cite the short_memory or element you relied on.",
  ].join("\n");
}

export function buildToolDeclarations() {
  return [
    {
      name: "recall",
      description:
        "Hierarchical memory search. mode=\"fast\" walks Domain → Theme → Theme-internal RAG (1〜3 sec). " +
        "mode=\"deep\" requests multi-agent investigation (currently delegated to fast in MVP).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          mode: { type: "string", enum: ["fast", "deep", "auto"] },
          domains: { type: "array", items: { type: "string" } },
          themes: { type: "array", items: { type: "string" } },
          element_types: {
            type: "array",
            items: {
              type: "string",
              enum: ["fact", "question", "decision", "emotion", "task", "preference"],
            },
          },
          time_hint: { type: "string", enum: ["recent", "anytime"] },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_recent",
      description: "List short_memories created within the last N days, newest first.",
      input_schema: {
        type: "object",
        properties: {
          days: { type: "number" },
          limit: { type: "number" },
        },
        required: ["days"],
      },
    },
    {
      name: "get_related",
      description: "Return short_memories linked to the given short_id via memory_links.",
      input_schema: {
        type: "object",
        properties: {
          short_id: { type: "string" },
          limit: { type: "number" },
        },
        required: ["short_id"],
      },
    },
  ];
}
