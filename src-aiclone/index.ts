export * as memory from "./memory/index.js";
export * as heartbeat from "./heartbeat/index.js";
export { registerAiCloneContextEngine, AiCloneEngine } from "./context-engine/index.js";
export {
  runAiCloneDreaming,
  type DreamingPhase,
  type CompressFn,
} from "./dreaming/aiclone-dreaming.js";
export { handleDropFile } from "./ingestion/dropfile.js";
export {
  registerBgeM3Adapter,
  BgeM3EmbeddingProvider,
  DEFAULT_BGE_M3_CONFIG,
} from "./embedding/bge-m3-adapter.js";
