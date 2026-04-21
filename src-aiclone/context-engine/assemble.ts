import type { ContextBlocks } from "../memory/context-blocks.js";

export function buildSystemPromptAddition(blocks: ContextBlocks): string {
  const persona = blocks.persona.trim() || "(persona.md is empty)";
  const working = blocks.working.trim() || "(working.md is empty)";
  return [
    "You are kouta's personal AI partner.",
    "Treat the following persona and working memory as ground truth context for every turn.",
    "",
    "<persona>",
    persona,
    "</persona>",
    "",
    "<working>",
    working,
    "</working>",
    "",
    "When the user refers to past events or asks recall-style questions,",
    "use the recall / get_recent / get_related tools before answering.",
    "Always cite the short_memory or fact you relied on when the user asks why.",
  ].join("\n");
}

export function buildToolDeclarations() {
  return [
    {
      name: "recall",
      description:
        "Fact-primary hybrid search over the user's long-term memory. Returns short_memory headlines with hit facts.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          themes: { type: "array", items: { type: "string" } },
          memory_type: {
            type: "string",
            enum: ["episodic", "fact", "preference", "profile"],
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
