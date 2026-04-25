export { ensureAiCloneSchema, type EmbeddingMeta } from "./schema.js";
export {
  routeRecall,
  type EmbedFn,
  type DomainThemeSelector,
  type RecallFastDeps,
  type RouteRecallDeps,
} from "./recall.js";
export { recallFast } from "./recall-fast.js";
export { recallDeep } from "./recall-deep.js";
export {
  upsertShortMemoryAndElements,
  listExistingDomainNames,
  listExistingThemeNamesForDomains,
} from "./semantic-elements.js";
export {
  ensureSeedDomains,
  listDomainsForIndex,
  SEED_DOMAINS,
  type SeedDomain,
} from "./domains.js";
export {
  logAccess,
  getRecentShortMemories,
  getRelatedShortMemories,
  type AccessVia,
} from "./access-log.js";
export { getContextBlocks, type ContextBlocks } from "./context-blocks.js";
export type {
  ElementType,
  RecallMode,
  TimeHint,
  RecallParams,
  RecallHit,
  RecallElement,
  RecallResult,
  ShortMemoryInput,
} from "./types.js";
