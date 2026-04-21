export { ensureAiCloneSchema, type EmbeddingMeta } from "./schema.js";
export { recall, type EmbedFn } from "./recall.js";
export { upsertShortMemoryAndFacts, listExistingThemeNames } from "./short-memory.js";
export {
  logAccess,
  getRecentShortMemories,
  getRelatedShortMemories,
  type AccessVia,
} from "./access-log.js";
export { getContextBlocks, type ContextBlocks } from "./context-blocks.js";
export type {
  FactType,
  TimeHint,
  RecallParams,
  RecallHit,
  RecallResult,
  ShortMemoryInput,
} from "./types.js";
